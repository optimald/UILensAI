const sharp = require('sharp');

/**
 * Resizes an image buffer if it exceeds the specified maximum dimension.
 * Maintains aspect ratio and applies compression for UI analysis optimization.
 * 
 * @param {Buffer} imageBuffer - The original image buffer
 * @param {boolean} verbose - Whether to log verbose information
 * @param {number} maxDimension - Maximum width or height (default: 1200px for Claude optimization)
 * @param {object} options - Additional options for compression
 * @returns {Promise<Buffer>} The processed image buffer
 */
async function resizeImageIfNeeded(imageBuffer, verbose = false, maxDimension = 1200, options = {}) {
    const sharp = require('sharp');
    
    try {
        const metadata = await sharp(imageBuffer).metadata();
        const { width, height, format, size } = metadata;
        const fileSizeMB = size / (1024 * 1024);
        
        if (verbose) {
            console.log(`[ImageProcessor] Input: ${width}x${height}, ${fileSizeMB.toFixed(2)}MB, ${format}`);
        }
        
        // Determine if processing is needed
        const needsResize = width > maxDimension || height > maxDimension;
        const needsCompression = fileSizeMB > 2; // Compress if > 2MB
        const isLargeFile = fileSizeMB > 5; // Very aggressive compression for > 5MB
        
        if (!needsResize && !needsCompression && !options.forceCompress) {
            if (verbose) {console.log(`[ImageProcessor] No processing needed`);}
            return imageBuffer;
        }
        
        let processor = sharp(imageBuffer);
        
        // Resize if needed
        if (needsResize) {
            const scaleFactor = maxDimension / Math.max(width, height);
            const newWidth = Math.round(width * scaleFactor);
            const newHeight = Math.round(height * scaleFactor);
            
            processor = processor.resize(newWidth, newHeight, {
                kernel: sharp.kernel.lanczos3,
                withoutEnlargement: true
            });
            
            if (verbose) {
                console.log(`[ImageProcessor] Resizing: ${width}x${height} → ${newWidth}x${newHeight} (scale: ${scaleFactor.toFixed(3)})`);
            }
        }
        
        // Apply format-specific compression
        if (format === 'png' || !format) {
            const pngOptions = {
                compressionLevel: isLargeFile ? 9 : 8,
                progressive: true
            };
            
            // More aggressive settings for large files
            if (isLargeFile) {
                pngOptions.quality = options.quality || 75;
                pngOptions.effort = 10; // Maximum effort for best compression
            } else if (needsCompression) {
                pngOptions.quality = options.quality || 85;
                pngOptions.effort = 8;
            }
            
            processor = processor.png(pngOptions);
        } else if (format === 'jpeg' || format === 'jpg') {
            const jpegQuality = isLargeFile ? 70 : (needsCompression ? 80 : 90);
            processor = processor.jpeg({ 
                quality: jpegQuality, 
                progressive: true,
                mozjpeg: true // Use mozjpeg for better compression
            });
        } else if (format === 'webp') {
            const webpQuality = isLargeFile ? 70 : (needsCompression ? 80 : 90);
            processor = processor.webp({ 
                quality: webpQuality,
                effort: isLargeFile ? 6 : 4
            });
        }
        
        const processedBuffer = await processor.toBuffer();
        const processedSizeMB = processedBuffer.length / (1024 * 1024);
        
        // If still too large, apply additional compression
        if (processedSizeMB > 3 && isLargeFile) {
            if (verbose) {console.log(`[ImageProcessor] Still large (${processedSizeMB.toFixed(2)}MB), applying additional compression...`);}
            
            const additionallyCompressed = await sharp(processedBuffer)
                .png({ 
                    compressionLevel: 9, 
                    quality: 60,
                    effort: 10,
                    progressive: true
                })
                .toBuffer();
            
            const finalSizeMB = additionallyCompressed.length / (1024 * 1024);
            
            if (verbose) {
                console.log(`[ImageProcessor] Final compression: ${processedSizeMB.toFixed(2)}MB → ${finalSizeMB.toFixed(2)}MB`);
            }
            
            return additionallyCompressed;
        }
        
        if (verbose) {
            console.log(`[ImageProcessor] Processed: ${fileSizeMB.toFixed(2)}MB → ${processedSizeMB.toFixed(2)}MB (${((1 - processedSizeMB/fileSizeMB) * 100).toFixed(1)}% reduction)`);
        }
        
        return processedBuffer;
        
    } catch (error) {
        console.error(`[ImageProcessor] Error processing image: ${error.message}`);
        if (verbose) {console.error(error.stack);}
        return imageBuffer; // Return original on error
    }
}

/**
 * Optimizes an image specifically for AI analysis, balancing quality and file size
 * @param {Buffer} imageBuffer - The original image buffer
 * @param {boolean} verbose - Whether to log verbose information
 * @returns {Promise<Buffer>} The optimized image buffer
 */
async function optimizeForAIAnalysis(imageBuffer, verbose = false) {
    return resizeImageIfNeeded(imageBuffer, verbose, 1200, { 
        forceCompress: true,
        quality: 85
    });
}

/**
 * Checks if an image is blank or mostly empty
 * 
 * @param {string} imagePath - Path to the image file
 * @param {Object} options - Options for blank detection
 * @param {number} options.threshold - Brightness threshold (0-255, default 250)
 * @param {boolean} options.verbose - Whether to show verbose logs
 * @returns {Promise<Object>} - Analysis result with isBlank flag and detailed data
 */
async function isBlankImage(imagePath, options = {}) {
  const { threshold = 250, verbose = false } = options;
  
  try {
    // Get image stats and metadata
    const { channels, dominant } = await sharp(imagePath).stats();
    const metadata = await sharp(imagePath).metadata();
    
    // Calculate various metrics
    const avgBrightness = channels.reduce((sum, channel) => sum + channel.mean, 0) / channels.length;
    const maxBrightness = Math.max(...channels.map(c => c.max));
    const minBrightness = Math.min(...channels.map(c => c.min));
    const brightnessRange = maxBrightness - minBrightness;
    
    // Calculate standard deviation to measure content variance
    const avgStdDev = channels.reduce((sum, channel) => sum + channel.stdev, 0) / channels.length;
    
    // A truly blank image will have:
    // 1. Very high average brightness (> 250)
    // 2. Very low brightness range (< 10, meaning mostly uniform color)
    // 3. Very low standard deviation (< 5, meaning no content variation)
    const isBlank = avgBrightness > threshold && brightnessRange < 10 && avgStdDev < 5;
    
    const analysis = {
      avgBrightness: Math.round(avgBrightness * 100) / 100,
      maxBrightness,
      minBrightness,
      brightnessRange,
      avgStdDev: Math.round(avgStdDev * 100) / 100,
      threshold,
      dimensions: {
        width: metadata.width,
        height: metadata.height
      },
      fileSize: metadata.size || 0,
      format: metadata.format
    };
    
    if (verbose) {
      console.log(`Image analysis: ${avgBrightness.toFixed(2)} avg brightness, ${brightnessRange} range, ${avgStdDev.toFixed(2)} std dev (threshold: ${threshold}) - ${isBlank ? 'BLANK' : 'OK'}`);
    }
    
    return {
      isBlank,
      analysis
    };
  } catch (error) {
    if (verbose) {
      console.error(`Error checking if image is blank: ${error.message}`);
    }
    // If we can't check, assume it's not blank but return error info
    return {
      isBlank: false,
      analysis: {
        error: error.message,
        avgBrightness: 0,
        avgStdDev: 0,
        threshold
      }
    };
  }
}

module.exports = {
  resizeImageIfNeeded,
  optimizeForAIAnalysis,
  isBlankImage
}; 