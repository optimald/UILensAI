/**
 * Comprehensive Industry Taxonomy for UILensAI
 * 
 * 10x Expanded Industry Classification System
 * Based on NAICS, GICS, and real-world business patterns
 * 
 * Structure:
 * - Sector (13 broad categories matching schema primaryIndustry)
 * - Industry Group (100+ industries)
 * - Sub-Industry (500+ specific classifications)
 * 
 * Each entry includes:
 * - Keywords for improved detection
 * - Example companies
 * - Related regulatory frameworks
 */

const INDUSTRY_TAXONOMY = {
  // ═══════════════════════════════════════════════════════════════════════════
  // TECHNOLOGY SECTOR
  // ═══════════════════════════════════════════════════════════════════════════
  "Technology": {
    description: "Technology products, software, and IT services",
    industries: {
      "Software & SaaS": {
        subIndustries: [
          "Enterprise Resource Planning (ERP)",
          "Customer Relationship Management (CRM)",
          "Human Capital Management (HCM)",
          "Supply Chain Management Software",
          "Project Management & Collaboration Tools",
          "Business Intelligence & Analytics",
          "Cybersecurity Software",
          "DevOps & CI/CD Tools",
          "Cloud Infrastructure & Platforms",
          "API Management & Integration",
          "Low-Code/No-Code Platforms",
          "Database Management Systems",
          "AI & Machine Learning Platforms",
          "Marketing Automation Software",
          "Sales Enablement Tools",
          "Customer Support & Helpdesk Software",
          "Document Management Systems",
          "E-Signature & Contract Management",
          "Accounting & Financial Software",
          "Inventory Management Software"
        ],
        keywords: ["saas", "software", "platform", "cloud", "enterprise", "dashboard", "api", "integration", "automation"],
        examples: ["Salesforce", "HubSpot", "Slack", "Atlassian", "ServiceNow", "Workday"]
      },
      "Consumer Software & Apps": {
        subIndustries: [
          "Productivity Apps",
          "Note-Taking & Organization Apps",
          "Password Managers",
          "Photo & Video Editing Apps",
          "Music & Audio Apps",
          "Communication & Messaging Apps",
          "Social Networking Apps",
          "Dating Apps",
          "Fitness & Health Tracking Apps",
          "Personal Finance Apps",
          "Language Learning Apps",
          "Gaming Apps (Mobile)",
          "Navigation & Maps Apps",
          "Weather Apps",
          "News & Reading Apps"
        ],
        keywords: ["app", "download", "mobile", "ios", "android", "play store", "app store"],
        examples: ["Notion", "1Password", "Duolingo", "Headspace", "YNAB"]
      },
      "Home Automation & Smart Home": {
        subIndustries: [
          "Smart Home Installation Services",
          "Home Security Systems",
          "Smart Lighting Solutions",
          "Smart HVAC & Climate Control",
          "Home Automation Consulting",
          "Smart Lock & Access Control",
          "Video Doorbell & Surveillance",
          "Smart Speaker & Voice Assistants",
          "Smart Appliance Integration",
          "Whole-Home Automation Systems",
          "Energy Management Systems",
          "Smart Irrigation & Outdoor",
          "Home Theater & A/V Integration",
          "Smart Blinds & Window Treatments",
          "IoT Device Management"
        ],
        keywords: ["smart home", "automation", "iot", "connected", "alexa", "google home", "homekit", "zigbee", "z-wave", "installation", "integrator"],
        examples: ["Control4", "Savant", "Crestron", "Ring", "Nest", "Lutron", "Brilliant"]
      },
      "IT Services & Consulting": {
        subIndustries: [
          "Managed IT Services (MSP)",
          "Cloud Migration Services",
          "IT Infrastructure Management",
          "Network Administration Services",
          "IT Help Desk & Support",
          "IT Strategy Consulting",
          "Digital Transformation Consulting",
          "Systems Integration Services",
          "IT Outsourcing",
          "IT Training & Certification",
          "IT Audit & Compliance",
          "Disaster Recovery Services",
          "IT Asset Management",
          "Virtualization Services",
          "IT Procurement & Vendor Management"
        ],
        keywords: ["managed services", "msp", "it support", "helpdesk", "consulting", "outsourcing", "infrastructure"],
        examples: ["Accenture", "IBM Services", "Cognizant", "Infosys", "TCS"]
      },
      "Cybersecurity": {
        subIndustries: [
          "Endpoint Security",
          "Network Security",
          "Cloud Security (CASB, CSPM)",
          "Identity & Access Management (IAM)",
          "Security Information & Event Management (SIEM)",
          "Vulnerability Management",
          "Penetration Testing Services",
          "Security Operations Center (SOC) Services",
          "Data Loss Prevention (DLP)",
          "Email Security",
          "Web Application Firewall (WAF)",
          "Zero Trust Security",
          "Threat Intelligence",
          "Security Awareness Training",
          "Incident Response Services",
          "Compliance & GRC Platforms",
          "Encryption & Key Management",
          "Security Consulting"
        ],
        keywords: ["security", "cyber", "protection", "threat", "firewall", "antivirus", "encryption", "compliance", "soc", "penetration test"],
        examples: ["CrowdStrike", "Palo Alto Networks", "Okta", "Splunk", "Zscaler"]
      },
      "Hardware & Devices": {
        subIndustries: [
          "Personal Computers & Laptops",
          "Servers & Data Center Hardware",
          "Networking Equipment (Routers, Switches)",
          "Storage Solutions (NAS, SAN)",
          "Computer Peripherals (Keyboards, Mice)",
          "Monitors & Displays",
          "Printers & Imaging",
          "Tablets & Mobile Devices",
          "Wearable Technology",
          "Smart Watches & Fitness Trackers",
          "VR/AR Hardware",
          "Audio Equipment (Headphones, Speakers)",
          "Webcams & Video Conferencing Hardware",
          "Point of Sale (POS) Hardware",
          "Barcode Scanners & RFID"
        ],
        keywords: ["hardware", "device", "computer", "laptop", "server", "networking", "peripheral"],
        examples: ["Dell", "HP", "Lenovo", "Cisco", "Apple", "Logitech"]
      },
      "Semiconductors": {
        subIndustries: [
          "Integrated Circuit Manufacturing",
          "Memory Chips (DRAM, NAND)",
          "Processor & CPU Design",
          "GPU & Graphics Chips",
          "FPGA & Programmable Logic",
          "Analog Semiconductors",
          "Power Semiconductors",
          "Sensor Chips",
          "RF & Wireless Chips",
          "Automotive Semiconductors",
          "Semiconductor Equipment",
          "Semiconductor Materials",
          "Chip Packaging & Testing",
          "Foundry Services (Fab)",
          "Fabless Chip Design"
        ],
        keywords: ["semiconductor", "chip", "silicon", "processor", "fabrication", "foundry", "wafer"],
        examples: ["Intel", "AMD", "NVIDIA", "TSMC", "Qualcomm", "Broadcom"]
      },
      "Telecommunications": {
        subIndustries: [
          "Mobile Network Operators (MNO)",
          "Internet Service Providers (ISP)",
          "Cable & Satellite TV Providers",
          "VoIP & Unified Communications",
          "Fiber Optic Network Providers",
          "5G Infrastructure",
          "Telecom Equipment Manufacturing",
          "Tower Companies & Infrastructure",
          "Submarine Cable Operators",
          "Satellite Communications",
          "Business Phone Systems",
          "Network Testing & Optimization",
          "Telecom Consulting",
          "MVNO (Virtual Network Operators)",
          "SD-WAN Providers"
        ],
        keywords: ["telecom", "mobile", "wireless", "5g", "internet provider", "isp", "network", "fiber", "broadband"],
        examples: ["Verizon", "AT&T", "T-Mobile", "Comcast", "Ericsson", "Nokia"]
      },
      "Web Services & Hosting": {
        subIndustries: [
          "Web Hosting Providers",
          "Cloud Hosting (IaaS)",
          "Managed WordPress Hosting",
          "VPS & Dedicated Servers",
          "CDN Providers",
          "Domain Registrars",
          "DNS Services",
          "SSL Certificate Providers",
          "Email Hosting",
          "Website Builders & CMS",
          "Serverless Computing Platforms",
          "Container Hosting & Kubernetes",
          "Edge Computing Services",
          "API Hosting & Gateway Services",
          "Database-as-a-Service"
        ],
        keywords: ["hosting", "domain", "server", "cloud", "cdn", "website builder", "wordpress"],
        examples: ["AWS", "Google Cloud", "Azure", "DigitalOcean", "Cloudflare", "GoDaddy", "Vercel"]
      },
      "Web Development Agencies": {
        subIndustries: [
          "Full-Service Web Development",
          "E-commerce Development",
          "Custom Web Application Development",
          "WordPress Development",
          "Shopify Development",
          "Mobile App Development",
          "UI/UX Design Agencies",
          "Front-End Development",
          "Back-End Development",
          "API Development Services",
          "Headless CMS Implementation",
          "Web Accessibility Services",
          "Performance Optimization",
          "Web Maintenance & Support",
          "MVP & Startup Development"
        ],
        keywords: ["web development", "agency", "design", "development", "portfolio", "clients", "projects"],
        examples: ["Huge", "R/GA", "IDEO", "Fantasy", "Instrument"]
      },
      "Data & Analytics": {
        subIndustries: [
          "Business Intelligence Platforms",
          "Data Visualization Tools",
          "Data Warehousing Solutions",
          "ETL & Data Integration",
          "Customer Data Platforms (CDP)",
          "Marketing Analytics",
          "Product Analytics",
          "Web Analytics",
          "Predictive Analytics",
          "Big Data Platforms",
          "Data Science Consulting",
          "A/B Testing Platforms",
          "Data Quality & Governance",
          "Real-Time Analytics",
          "Location Intelligence"
        ],
        keywords: ["analytics", "data", "insights", "dashboard", "visualization", "reporting", "metrics"],
        examples: ["Tableau", "Looker", "Snowflake", "Databricks", "Amplitude", "Mixpanel"]
      },
      "AI & Machine Learning": {
        subIndustries: [
          "AI Development Platforms",
          "Computer Vision Solutions",
          "Natural Language Processing (NLP)",
          "Conversational AI & Chatbots",
          "Machine Learning Operations (MLOps)",
          "AI Infrastructure & Training",
          "Generative AI Applications",
          "Speech Recognition & Synthesis",
          "Recommendation Engines",
          "AI Consulting Services",
          "Autonomous Systems",
          "AI Ethics & Governance",
          "Document AI & OCR",
          "AI for Healthcare",
          "AI for Finance"
        ],
        keywords: ["ai", "artificial intelligence", "machine learning", "deep learning", "neural network", "gpt", "llm", "automation"],
        examples: ["OpenAI", "Anthropic", "Hugging Face", "DataRobot", "C3.ai", "Scale AI"]
      },
      "Blockchain & Crypto": {
        subIndustries: [
          "Cryptocurrency Exchanges",
          "Crypto Wallets",
          "Blockchain Development Platforms",
          "NFT Marketplaces",
          "DeFi Protocols",
          "Enterprise Blockchain Solutions",
          "Blockchain Consulting",
          "Crypto Payment Processing",
          "Stablecoin Issuers",
          "Crypto Mining",
          "Crypto Custody Services",
          "Blockchain Analytics & Compliance",
          "DAO Tooling",
          "Web3 Infrastructure",
          "Smart Contract Auditing"
        ],
        keywords: ["blockchain", "crypto", "bitcoin", "ethereum", "nft", "defi", "web3", "wallet", "token"],
        examples: ["Coinbase", "Binance", "OpenSea", "Alchemy", "Chainalysis"]
      }
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // HEALTHCARE SECTOR
  // ═══════════════════════════════════════════════════════════════════════════
  "Healthcare": {
    description: "Healthcare providers, services, and medical technology",
    industries: {
      "Hospitals & Health Systems": {
        subIndustries: [
          "Academic Medical Centers",
          "Community Hospitals",
          "Specialty Hospitals (Orthopedic, Cardiac)",
          "Children's Hospitals",
          "Rehabilitation Hospitals",
          "Psychiatric Hospitals",
          "Long-Term Acute Care Hospitals",
          "Critical Access Hospitals",
          "Veterans Hospitals",
          "Military Hospitals",
          "Ambulatory Surgery Centers",
          "Hospital Management Companies"
        ],
        keywords: ["hospital", "medical center", "health system", "patient", "care", "treatment", "emergency"],
        examples: ["Mayo Clinic", "Cleveland Clinic", "Johns Hopkins", "Kaiser Permanente", "HCA Healthcare"]
      },
      "Physician Practices": {
        subIndustries: [
          "Primary Care / Family Medicine",
          "Internal Medicine",
          "Pediatrics",
          "OB/GYN",
          "Cardiology",
          "Orthopedics",
          "Dermatology",
          "Neurology",
          "Ophthalmology",
          "Oncology",
          "Gastroenterology",
          "Urology",
          "Pulmonology",
          "Endocrinology",
          "Rheumatology",
          "Infectious Disease",
          "Pain Management",
          "Sports Medicine",
          "Concierge Medicine",
          "Direct Primary Care"
        ],
        keywords: ["doctor", "physician", "clinic", "practice", "specialist", "appointment", "patient portal"],
        examples: ["One Medical", "Oak Street Health", "VillageMD"]
      },
      "Dental Care": {
        subIndustries: [
          "General Dentistry",
          "Pediatric Dentistry",
          "Orthodontics",
          "Oral Surgery",
          "Periodontics",
          "Endodontics",
          "Prosthodontics",
          "Cosmetic Dentistry",
          "Dental Implants",
          "Dental Sleep Medicine",
          "TMJ/TMD Treatment",
          "Dental Group Practices",
          "Mobile Dentistry"
        ],
        keywords: ["dental", "dentist", "teeth", "orthodontic", "braces", "invisalign", "smile", "oral"],
        examples: ["Aspen Dental", "Heartland Dental", "Pacific Dental Services"]
      },
      "Mental Health & Behavioral Health": {
        subIndustries: [
          "Psychiatry Practices",
          "Psychology & Therapy",
          "Marriage & Family Therapy",
          "Addiction Treatment Centers",
          "Substance Abuse Counseling",
          "Eating Disorder Treatment",
          "Child & Adolescent Mental Health",
          "Geriatric Mental Health",
          "Trauma & PTSD Treatment",
          "Anxiety & Depression Treatment",
          "Group Therapy Practices",
          "Employee Assistance Programs (EAP)",
          "Crisis Intervention Services",
          "Telemental Health Platforms"
        ],
        keywords: ["mental health", "therapy", "counseling", "psychiatry", "depression", "anxiety", "wellness", "behavioral"],
        examples: ["BetterHelp", "Talkspace", "Lyra Health", "Ginger", "Cerebral"]
      },
      "Digital Health & Telehealth": {
        subIndustries: [
          "Telehealth Platforms",
          "Remote Patient Monitoring",
          "Digital Therapeutics",
          "Health Apps & Wearables",
          "Mental Health Apps",
          "Chronic Disease Management Apps",
          "Medication Management Apps",
          "Virtual Primary Care",
          "Virtual Specialty Care",
          "Virtual Urgent Care",
          "Clinical Decision Support",
          "Patient Engagement Platforms",
          "Healthcare Chatbots & AI",
          "Digital Clinical Trials"
        ],
        keywords: ["telehealth", "telemedicine", "virtual care", "remote", "digital health", "app", "wearable", "monitor"],
        examples: ["Teladoc", "Amwell", "Doctor on Demand", "Livongo", "Omada Health"]
      },
      "Pharmaceuticals": {
        subIndustries: [
          "Big Pharma (Large Pharmaceutical)",
          "Specialty Pharmaceuticals",
          "Generic Drug Manufacturers",
          "Biopharmaceuticals",
          "Vaccine Development",
          "Oncology Drugs",
          "Rare Disease Drugs (Orphan Drugs)",
          "CNS/Neurological Drugs",
          "Cardiovascular Drugs",
          "Immunology & Autoimmune Drugs",
          "Infectious Disease Drugs",
          "Contract Research Organizations (CRO)",
          "Contract Manufacturing (CDMO)",
          "Pharmaceutical Distribution"
        ],
        keywords: ["pharmaceutical", "drug", "medication", "clinical trial", "fda", "treatment", "therapy"],
        examples: ["Pfizer", "Johnson & Johnson", "Merck", "Novartis", "Roche"]
      },
      "Medical Devices": {
        subIndustries: [
          "Diagnostic Imaging Equipment",
          "Surgical Instruments",
          "Orthopedic Devices & Implants",
          "Cardiovascular Devices",
          "Diabetes Care Devices",
          "Respiratory Devices",
          "Neurology Devices",
          "Ophthalmology Devices",
          "Dental Devices",
          "Hearing Aids & Audiology",
          "Patient Monitoring Equipment",
          "Laboratory Equipment",
          "Hospital Furniture & Equipment",
          "Sterilization Equipment",
          "3D Printing for Medical"
        ],
        keywords: ["medical device", "equipment", "implant", "diagnostic", "surgical", "fda cleared", "510k"],
        examples: ["Medtronic", "Abbott", "Boston Scientific", "Stryker", "Edwards Lifesciences"]
      },
      "Biotechnology": {
        subIndustries: [
          "Therapeutics Development",
          "Gene Therapy",
          "Cell Therapy",
          "Antibody Development",
          "mRNA Technology",
          "Genomics & Sequencing",
          "Proteomics",
          "Synthetic Biology",
          "Agricultural Biotechnology",
          "Industrial Biotechnology",
          "Biotech Research Tools",
          "CRISPR & Gene Editing",
          "Stem Cell Research",
          "Microbiome Therapeutics"
        ],
        keywords: ["biotech", "biotechnology", "gene", "therapy", "clinical", "research", "molecular"],
        examples: ["Moderna", "Genentech", "Regeneron", "Gilead", "Vertex"]
      },
      "Senior Care & Aging": {
        subIndustries: [
          "Skilled Nursing Facilities",
          "Assisted Living",
          "Independent Living",
          "Memory Care",
          "Home Health Care",
          "Hospice Care",
          "Adult Day Care",
          "Continuing Care Retirement Communities (CCRC)",
          "Geriatric Care Management",
          "Elder Care Technology",
          "Medical Alert Systems",
          "Senior Transportation Services",
          "Meals on Wheels & Nutrition",
          "Caregiver Support Services"
        ],
        keywords: ["senior", "elderly", "aging", "assisted living", "nursing home", "memory care", "hospice", "retirement"],
        examples: ["Brookdale Senior Living", "Sunrise Senior Living", "Amedisys", "VITAS Healthcare"]
      },
      "Veterinary Services": {
        subIndustries: [
          "General Veterinary Practice",
          "Emergency & Critical Care Vet",
          "Veterinary Specialty Hospitals",
          "Mobile Veterinary Services",
          "Veterinary Dentistry",
          "Veterinary Dermatology",
          "Veterinary Oncology",
          "Veterinary Surgery",
          "Veterinary Rehabilitation",
          "Exotic Animal Veterinary",
          "Equine Veterinary",
          "Large Animal Veterinary",
          "Pet Wellness & Preventive Care",
          "Veterinary Telemedicine"
        ],
        keywords: ["veterinary", "vet", "animal", "pet", "dog", "cat", "clinic", "hospital"],
        examples: ["VCA Animal Hospitals", "Banfield Pet Hospital", "BluePearl Specialty"]
      },
      "Health Insurance": {
        subIndustries: [
          "Commercial Health Insurance",
          "Medicare Plans",
          "Medicaid Managed Care",
          "Health Insurance Marketplaces",
          "Supplemental Insurance",
          "Vision Insurance",
          "Dental Insurance",
          "Short-Term Health Insurance",
          "Health Sharing Ministries",
          "Pet Insurance",
          "Travel Health Insurance",
          "Workers' Compensation Insurance",
          "Stop-Loss Insurance",
          "Health Insurance Brokers"
        ],
        keywords: ["health insurance", "coverage", "plan", "premium", "benefits", "network", "claim"],
        examples: ["UnitedHealth", "Anthem", "Cigna", "Aetna", "Humana"]
      },
      "Wellness & Fitness": {
        subIndustries: [
          "Gyms & Fitness Centers",
          "Boutique Fitness Studios",
          "Yoga Studios",
          "Pilates Studios",
          "CrossFit Gyms",
          "Personal Training Services",
          "Corporate Wellness Programs",
          "Wellness Coaching",
          "Nutrition Counseling",
          "Weight Loss Programs",
          "Spa & Wellness Retreats",
          "Meditation & Mindfulness Centers",
          "Fitness App & Platforms",
          "Virtual Fitness Classes",
          "Recovery & Cryotherapy"
        ],
        keywords: ["fitness", "gym", "wellness", "health", "workout", "training", "yoga", "nutrition"],
        examples: ["Planet Fitness", "Equinox", "SoulCycle", "Orange Theory", "Peloton", "ClassPass"]
      },
      "Alternative & Complementary Medicine": {
        subIndustries: [
          "Chiropractic Services",
          "Acupuncture & Traditional Chinese Medicine",
          "Naturopathic Medicine",
          "Homeopathy",
          "Ayurveda",
          "Functional Medicine",
          "Integrative Medicine",
          "Massage Therapy",
          "Physical Therapy",
          "Occupational Therapy",
          "Speech Therapy",
          "Herbal & Natural Supplements",
          "Holistic Health Centers",
          "IV Therapy & Infusion Centers"
        ],
        keywords: ["chiropractic", "acupuncture", "holistic", "natural", "alternative", "integrative", "therapy"],
        examples: ["The Joint Chiropractic", "Modern Acupuncture", "PCRM"]
      },
      "Specialty Clinics & Centers": {
        subIndustries: [
          "Urgent Care Center",
          "Walk-In Clinic",
          "Retail Health Clinic",
          "Minute Clinic",
          "After-Hours Clinic",
          "Occupational Health Clinic",
          "Workers Comp Clinic",
          "Pain Management Clinic",
          "Pain Medicine Center",
          "Interventional Pain Management",
          "Spine Center",
          "Back & Neck Clinic",
          "Weight Loss Clinic",
          "Medical Weight Loss",
          "Bariatric Center",
          "Obesity Medicine",
          "Sleep Center",
          "Sleep Medicine Clinic",
          "Sleep Lab",
          "Wound Care Center",
          "Hyperbaric Oxygen Therapy",
          "Dialysis Center",
          "Kidney Dialysis",
          "Infusion Center",
          "Chemotherapy Infusion",
          "Imaging Center",
          "MRI Center",
          "CT Scan Center",
          "X-Ray Clinic",
          "Ultrasound Imaging",
          "Mammography Center",
          "Diagnostic Lab",
          "Blood Testing Lab",
          "Pathology Lab",
          "Allergy Clinic",
          "Allergy & Immunology",
          "Allergy Testing",
          "Allergy Shots & Immunotherapy",
          "Fertility Clinic",
          "IVF Clinic",
          "Reproductive Endocrinology",
          "Vein Clinic",
          "Vein Treatment Center",
          "Varicose Vein Treatment",
          "Spider Vein Treatment"
        ],
        keywords: ["urgent care", "clinic", "center", "imaging", "lab", "diagnostic", "pain management"],
        examples: ["CityMD", "ZoomCare", "MinuteClinic", "AFC Urgent Care", "MedExpress"]
      },
      "Vision & Eye Care": {
        subIndustries: [
          "Optometry Practice",
          "Eye Exam",
          "Contact Lens Fitting",
          "Optical Shop",
          "Eyeglasses Retail",
          "Ophthalmology Practice",
          "LASIK Center",
          "LASIK Surgery",
          "PRK Surgery",
          "Cataract Surgery",
          "Glaucoma Treatment",
          "Retina Specialist",
          "Macular Degeneration Treatment",
          "Pediatric Ophthalmology",
          "Cornea Specialist",
          "Oculoplastic Surgery",
          "Low Vision Services",
          "Vision Therapy"
        ],
        keywords: ["eye", "vision", "optometrist", "ophthalmologist", "lasik", "glasses", "contacts", "optical"],
        examples: ["LensCrafters", "Visionworks", "MyEyeDr", "LASIK MD", "TLC Laser Eye Centers"]
      },
      "Hearing & Audiology": {
        subIndustries: [
          "Audiology Practice",
          "Hearing Test",
          "Hearing Aid Center",
          "Hearing Aid Sales",
          "Hearing Aid Fitting",
          "Cochlear Implant Center",
          "Tinnitus Treatment",
          "Ear Nose & Throat (ENT)",
          "Otolaryngology",
          "Pediatric Audiology",
          "Industrial Hearing Testing",
          "Musician Hearing Protection"
        ],
        keywords: ["hearing", "audiology", "hearing aid", "audiologist", "ear", "deaf", "tinnitus"],
        examples: ["Miracle-Ear", "Beltone", "HearingLife", "Audibel", "Connect Hearing"]
      },
      "Rehabilitation Services": {
        subIndustries: [
          "Physical Therapy Clinic",
          "Outpatient Physical Therapy",
          "Sports Physical Therapy",
          "Orthopedic Physical Therapy",
          "Neurological Physical Therapy",
          "Pediatric Physical Therapy",
          "Geriatric Physical Therapy",
          "Pelvic Floor Physical Therapy",
          "Vestibular Rehabilitation",
          "Occupational Therapy Clinic",
          "Hand Therapy",
          "Speech Language Pathology",
          "Speech Therapy Clinic",
          "Pediatric Speech Therapy",
          "Swallowing Therapy",
          "Voice Therapy",
          "Cardiac Rehabilitation",
          "Pulmonary Rehabilitation",
          "Aquatic Therapy",
          "Athletic Training Services"
        ],
        keywords: ["physical therapy", "rehabilitation", "rehab", "pt", "ot", "speech therapy", "recovery"],
        examples: ["ATI Physical Therapy", "Athletico", "FYZICAL", "Ivy Rehab"]
      },
      "Addiction & Recovery": {
        subIndustries: [
          "Drug Rehab Center",
          "Alcohol Rehab Center",
          "Inpatient Rehab",
          "Residential Treatment",
          "Outpatient Treatment",
          "Intensive Outpatient (IOP)",
          "Partial Hospitalization (PHP)",
          "Medical Detox",
          "Suboxone Clinic",
          "MAT (Medication-Assisted Treatment)",
          "Methadone Clinic",
          "Sober Living Home",
          "Halfway House",
          "12-Step Programs",
          "AA/NA Meeting Location",
          "Dual Diagnosis Treatment",
          "Teen Rehab",
          "Executive Rehab",
          "Holistic Rehab",
          "Faith-Based Recovery"
        ],
        keywords: ["rehab", "addiction", "recovery", "treatment", "detox", "sober", "alcohol", "drug"],
        examples: ["Hazelden Betty Ford", "Caron Treatment Centers", "Sierra Tucson", "The Meadows"]
      },
      "Senior Care Services": {
        subIndustries: [
          "In-Home Caregivers",
          "Home Care Agency",
          "Home Health Aides",
          "Certified Nursing Assistants (CNA)",
          "Personal Care Assistants",
          "Companion Care",
          "Companionship Services",
          "Respite Care",
          "Live-In Care",
          "24-Hour Home Care",
          "Overnight Care",
          "Alzheimer's Care",
          "Dementia Care",
          "Memory Care (In-Home)",
          "Parkinson's Care",
          "Stroke Recovery Care",
          "Post-Surgery Care",
          "Post-Hospitalization Care",
          "Transitional Care",
          "Palliative Care (In-Home)",
          "End-of-Life Care",
          "Medication Reminders",
          "Meal Preparation",
          "Light Housekeeping",
          "Transportation for Seniors",
          "Medical Appointment Transport",
          "Non-Emergency Medical Transport (NEMT)",
          "Wheelchair Transport",
          "Stretcher Transport",
          "Senior Meal Delivery",
          "Meals on Wheels",
          "Grocery Shopping for Seniors",
          "Errand Services for Seniors",
          "Medical Equipment Rental",
          "Wheelchair Rental",
          "Hospital Bed Rental",
          "Oxygen Equipment Rental",
          "Walker & Mobility Aid Rental",
          "Home Accessibility Modifications",
          "Stair Lift Installation",
          "Wheelchair Ramp Installation",
          "Grab Bar Installation",
          "Walk-In Tub Installation",
          "Bathroom Safety Modifications",
          "Aging in Place Consulting",
          "Geriatric Care Management",
          "Elder Care Consulting"
        ],
        keywords: ["senior care", "home care", "elderly", "caregiver", "aging", "elder care", "companion"],
        examples: ["Home Instead", "Comfort Keepers", "Visiting Angels", "BrightStar Care", "Right at Home"]
      },
      "Wellness & Life Coaching": {
        subIndustries: [
          "Life Coaching",
          "Certified Life Coach",
          "Executive Coaching",
          "Leadership Coaching",
          "Career Coaching",
          "Career Counseling",
          "Job Search Coaching",
          "Interview Coaching",
          "Resume Services",
          "Health Coaching",
          "Wellness Coaching",
          "Nutrition Coaching",
          "Weight Loss Coaching",
          "Fitness Coaching",
          "Sleep Coaching",
          "Sleep Consulting",
          "Stress Management",
          "Mindfulness Coaching",
          "Meditation Instructor",
          "Breathwork Instructor",
          "Lactation Consulting",
          "IBCLC Lactation",
          "Birth Doula",
          "Postpartum Doula",
          "Midwifery Services",
          "Childbirth Education",
          "Lamaze Classes",
          "Bradley Method Classes",
          "HypnoBirthing",
          "Infant Sleep Training",
          "Baby Sleep Consultant",
          "Parenting Coach",
          "Newborn Care Specialist",
          "Night Nanny",
          "ADHD Coaching",
          "Executive Function Coaching",
          "Academic Coaching",
          "Relationship Coaching",
          "Dating Coaching",
          "Marriage Coaching",
          "Divorce Coaching",
          "Grief Coaching",
          "Transition Coaching",
          "Retirement Coaching",
          "Spiritual Coaching",
          "Sobriety Coaching",
          "Recovery Coaching"
        ],
        keywords: ["coaching", "life coach", "wellness", "health coach", "doula", "lactation", "career coach"],
        examples: ["ICF Coaches", "NBHWC Coaches", "DONA Doulas", "CAPPA Doulas"]
      }
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // FINANCE SECTOR
  // ═══════════════════════════════════════════════════════════════════════════
  "Finance": {
    description: "Banking, financial services, fintech, and insurance",
    industries: {
      "Banking": {
        subIndustries: [
          "Commercial Banks",
          "Retail Banks",
          "Investment Banks",
          "Private Banks",
          "Community Banks",
          "Credit Unions",
          "Online-Only Banks (Neobanks)",
          "Savings & Loan Associations",
          "International Banks",
          "Central Banks",
          "Development Banks",
          "Islamic Banking",
          "Agricultural Banks",
          "Industrial Banks"
        ],
        keywords: ["bank", "banking", "account", "deposit", "loan", "mortgage", "savings", "checking"],
        examples: ["Chase", "Bank of America", "Wells Fargo", "Citibank", "Capital One"]
      },
      "Fintech & Digital Banking": {
        subIndustries: [
          "Digital Banks / Neobanks",
          "Payment Processing",
          "Mobile Payment Apps",
          "Peer-to-Peer Payments",
          "Buy Now Pay Later (BNPL)",
          "Digital Wallets",
          "Cryptocurrency Exchanges",
          "Robo-Advisors",
          "Personal Finance Apps",
          "Budgeting & Expense Tracking",
          "Fintech Lending",
          "Open Banking Platforms",
          "Banking-as-a-Service (BaaS)",
          "Embedded Finance",
          "RegTech & Compliance Tech"
        ],
        keywords: ["fintech", "app", "digital", "payment", "transfer", "mobile banking", "instant"],
        examples: ["PayPal", "Stripe", "Square", "Venmo", "Chime", "Robinhood", "Plaid"]
      },
      "Wealth Management": {
        subIndustries: [
          "Private Wealth Management",
          "Investment Advisory",
          "Family Offices",
          "Trust Services",
          "Estate Planning",
          "Tax Planning & Advisory",
          "Financial Planning",
          "Retirement Planning",
          "High-Net-Worth Services",
          "Ultra-High-Net-Worth Services",
          "Philanthropic Advisory",
          "Art & Collectibles Advisory",
          "Multi-Family Offices",
          "Fiduciary Services"
        ],
        keywords: ["wealth", "investment", "portfolio", "advisor", "planning", "high net worth", "trust"],
        examples: ["Morgan Stanley", "Merrill Lynch", "UBS", "Raymond James", "Edward Jones"]
      },
      "Asset Management": {
        subIndustries: [
          "Mutual Funds",
          "Exchange-Traded Funds (ETFs)",
          "Hedge Funds",
          "Private Equity",
          "Venture Capital",
          "Real Estate Investment (REITs)",
          "Index Funds",
          "Money Market Funds",
          "Pension Fund Management",
          "Sovereign Wealth Funds",
          "Endowment Management",
          "Fund Administration",
          "Alternative Investments",
          "ESG/Impact Investing"
        ],
        keywords: ["asset management", "fund", "investment", "portfolio", "returns", "aum", "equity"],
        examples: ["BlackRock", "Vanguard", "Fidelity", "State Street", "PIMCO"]
      },
      "Insurance": {
        subIndustries: [
          "Life Insurance",
          "Term Life Insurance",
          "Whole Life Insurance",
          "Health Insurance",
          "Auto Insurance",
          "Homeowners Insurance",
          "Renters Insurance",
          "Commercial Property Insurance",
          "Liability Insurance",
          "Professional Liability (E&O)",
          "Directors & Officers (D&O)",
          "Workers' Compensation",
          "Disability Insurance",
          "Travel Insurance",
          "Pet Insurance",
          "Specialty Insurance",
          "Reinsurance",
          "Insurtech",
          "Insurance Brokerage"
        ],
        keywords: ["insurance", "coverage", "policy", "premium", "claim", "protection", "underwriting"],
        examples: ["State Farm", "Progressive", "Allstate", "GEICO", "Liberty Mutual", "MetLife"]
      },
      "Lending & Credit": {
        subIndustries: [
          "Mortgage Lending",
          "Mortgage Brokers",
          "Auto Lending",
          "Personal Loans",
          "Student Loans",
          "Business Loans (Commercial)",
          "SBA Loans",
          "Equipment Financing",
          "Invoice Factoring",
          "Merchant Cash Advances",
          "Hard Money Lending",
          "Microfinance",
          "Peer-to-Peer Lending",
          "Online Lending Platforms",
          "Credit Cards & Issuers",
          "Collections & Debt Recovery"
        ],
        keywords: ["loan", "lending", "credit", "financing", "mortgage", "borrow", "interest rate", "apr"],
        examples: ["Quicken Loans", "LendingClub", "SoFi", "Upstart", "Kabbage"]
      },
      "Accounting & Tax": {
        subIndustries: [
          "Public Accounting Firms",
          "Tax Preparation Services",
          "Bookkeeping Services",
          "Forensic Accounting",
          "Audit Services",
          "Management Accounting",
          "Cost Accounting",
          "Tax Advisory",
          "International Tax",
          "Corporate Tax",
          "Individual Tax",
          "Tax Software",
          "Payroll Services",
          "CFO Services (Fractional CFO)",
          "Accounting Software"
        ],
        keywords: ["accounting", "tax", "cpa", "audit", "bookkeeping", "financial statements", "compliance"],
        examples: ["Deloitte", "PwC", "EY", "KPMG", "H&R Block", "TurboTax", "QuickBooks"]
      },
      "Real Estate Finance": {
        subIndustries: [
          "Commercial Real Estate Lending",
          "Residential Mortgage Banking",
          "Construction Lending",
          "Bridge Lending",
          "Mezzanine Financing",
          "Real Estate Investment Trusts (REITs)",
          "Real Estate Private Equity",
          "Real Estate Crowdfunding",
          "Mortgage Servicing",
          "Title Insurance",
          "Escrow Services",
          "Real Estate Appraisal",
          "Real Estate Tax Services"
        ],
        keywords: ["real estate finance", "mortgage", "commercial lending", "reit", "property investment"],
        examples: ["Fannie Mae", "Freddie Mac", "CBRE", "Walker & Dunlop"]
      },
      "Consumer Financial Services": {
        subIndustries: [
          "Check Cashing",
          "Check Cashing Store",
          "Payday Loans",
          "Payday Lender",
          "Title Loans",
          "Auto Title Loans",
          "Pawn Shop",
          "Pawn Broker",
          "Cash for Gold",
          "Gold Buying",
          "Coin Dealer",
          "Precious Metals Dealer",
          "Bail Bonds",
          "Bail Bondsman",
          "Surety Bonds",
          "Currency Exchange",
          "Foreign Currency Exchange",
          "Money Order Services",
          "Wire Transfer Services",
          "Money Transfer",
          "Bill Pay Services",
          "Prepaid Debit Cards",
          "Gift Card Exchange",
          "Lottery & Gaming",
          "Check Printing",
          "ATM Services",
          "ATM Placement",
          "Bitcoin ATM",
          "Crypto ATM"
        ],
        keywords: ["check cashing", "payday", "pawn", "bail bonds", "money transfer", "currency exchange"],
        examples: ["ACE Cash Express", "Check Into Cash", "Check 'n Go", "Money Mart", "Western Union"]
      }
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // RETAIL SECTOR
  // ═══════════════════════════════════════════════════════════════════════════
  "Retail": {
    description: "Physical and online retail, e-commerce",
    industries: {
      "E-commerce": {
        subIndustries: [
          "General E-commerce Marketplace",
          "Fashion E-commerce",
          "Electronics E-commerce",
          "Home & Garden E-commerce",
          "Beauty & Cosmetics E-commerce",
          "Health & Supplements E-commerce",
          "Pet E-commerce",
          "Food & Grocery E-commerce",
          "B2B E-commerce",
          "Luxury E-commerce",
          "Sustainable/Eco E-commerce",
          "Subscription E-commerce",
          "Dropshipping Stores",
          "Print-on-Demand",
          "Handmade & Artisan Marketplace",
          "Vintage & Resale Marketplace",
          "Niche/Specialty E-commerce"
        ],
        keywords: ["shop", "store", "buy", "cart", "checkout", "shipping", "order", "product", "e-commerce"],
        examples: ["Amazon", "eBay", "Etsy", "Shopify Stores", "Wayfair"]
      },
      "Fashion & Apparel Retail": {
        subIndustries: [
          "Fast Fashion",
          "Luxury Fashion",
          "Streetwear",
          "Athletic & Sportswear",
          "Women's Apparel",
          "Men's Apparel",
          "Children's Clothing",
          "Plus-Size Fashion",
          "Maternity Wear",
          "Sustainable Fashion",
          "Workwear & Uniforms",
          "Vintage & Thrift",
          "Rental Fashion",
          "Shoes & Footwear",
          "Accessories (Bags, Jewelry)",
          "Eyewear & Sunglasses"
        ],
        keywords: ["fashion", "clothing", "apparel", "wear", "style", "collection", "designer", "outfit"],
        examples: ["Zara", "H&M", "Nike", "Nordstrom", "ASOS", "Reformation"]
      },
      "Grocery & Food Retail": {
        subIndustries: [
          "Supermarkets",
          "Grocery Chains",
          "Organic & Natural Grocers",
          "Discount Grocers",
          "Convenience Stores",
          "Specialty Food Stores",
          "Butcher Shops",
          "Bakeries (Retail)",
          "Cheese & Deli Shops",
          "Wine & Spirits Shops",
          "Beer & Craft Beverage",
          "Farmers Markets",
          "Online Grocery",
          "Grocery Delivery",
          "Meal Kit Delivery",
          "Ethnic & International Foods"
        ],
        keywords: ["grocery", "food", "supermarket", "organic", "fresh", "produce", "delivery"],
        examples: ["Whole Foods", "Kroger", "Trader Joe's", "Costco", "Instacart"]
      },
      "Consumer Electronics Retail": {
        subIndustries: [
          "Electronics Superstores",
          "Mobile Phone Retail",
          "Computer & PC Retail",
          "Gaming & Console Retail",
          "Audio & Video Retail",
          "Camera & Photography",
          "Smart Home Retail",
          "Appliance Retail",
          "Used & Refurbished Electronics",
          "Electronics Repair Services"
        ],
        keywords: ["electronics", "gadget", "tech", "device", "phone", "computer", "gaming"],
        examples: ["Best Buy", "Apple Store", "GameStop", "Micro Center"]
      },
      "Home & Furniture Retail": {
        subIndustries: [
          "Furniture Stores",
          "Home Decor & Accessories",
          "Mattress Retail",
          "Kitchen & Bath",
          "Outdoor & Patio Furniture",
          "Home Office Furniture",
          "Lighting Stores",
          "Rug & Flooring Retail",
          "Window Treatments",
          "Antique & Vintage Furniture",
          "Modern/Contemporary Furniture",
          "Children's Furniture",
          "Custom Furniture",
          "Home Organization & Storage"
        ],
        keywords: ["furniture", "home", "decor", "interior", "living", "bedroom", "sofa", "table"],
        examples: ["IKEA", "Wayfair", "West Elm", "Pottery Barn", "Crate & Barrel"]
      },
      "Beauty & Cosmetics Retail": {
        subIndustries: [
          "Beauty Superstores",
          "Cosmetics Brands",
          "Skincare Brands",
          "Haircare Products",
          "Fragrance & Perfume",
          "Natural & Organic Beauty",
          "K-Beauty (Korean Beauty)",
          "Men's Grooming",
          "Nail Care",
          "Professional Beauty Supply",
          "Clean Beauty",
          "Luxury Beauty",
          "Beauty Subscription Boxes",
          "Beauty Tools & Accessories"
        ],
        keywords: ["beauty", "cosmetics", "skincare", "makeup", "hair", "fragrance", "glow"],
        examples: ["Sephora", "Ulta", "Glossier", "The Ordinary", "Fenty Beauty"]
      },
      "Department Stores": {
        subIndustries: [
          "Luxury Department Stores",
          "Mid-Market Department Stores",
          "Discount Department Stores",
          "Regional Department Stores",
          "Outlet Stores"
        ],
        keywords: ["department store", "mall", "retail", "brands", "shopping"],
        examples: ["Nordstrom", "Macy's", "Neiman Marcus", "Bloomingdale's", "JCPenney"]
      },
      "Specialty Retail": {
        subIndustries: [
          "Sporting Goods",
          "Outdoor & Adventure Gear",
          "Toys & Games",
          "Books & Media",
          "Music Instruments",
          "Art Supplies",
          "Craft & Hobby Stores",
          "Office Supplies",
          "Party Supplies",
          "Gift Shops",
          "Cards & Stationery",
          "Florists",
          "Jewelry Stores",
          "Watch Stores",
          "Luggage & Travel Goods"
        ],
        keywords: ["specialty", "hobby", "gift", "store", "shop"],
        examples: ["REI", "Dick's Sporting Goods", "Barnes & Noble", "Michaels", "Guitar Center"]
      }
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // MANUFACTURING SECTOR
  // ═══════════════════════════════════════════════════════════════════════════
  "Manufacturing": {
    description: "Industrial production and manufacturing",
    industries: {
      "Industrial Manufacturing": {
        subIndustries: [
          "Heavy Machinery Manufacturing",
          "Industrial Equipment",
          "Machine Tools",
          "Metalworking",
          "Welding Equipment",
          "Material Handling Equipment",
          "Pumps & Valves",
          "Compressors & Turbines",
          "Industrial Automation",
          "Robotics Manufacturing",
          "Precision Instruments",
          "Measurement & Control",
          "Industrial 3D Printing"
        ],
        keywords: ["manufacturing", "industrial", "machinery", "equipment", "production", "factory"],
        examples: ["Caterpillar", "John Deere", "Siemens", "ABB", "Fanuc"]
      },
      "Automotive Manufacturing": {
        subIndustries: [
          "Passenger Vehicle Manufacturing",
          "Commercial Vehicle Manufacturing",
          "Electric Vehicle Manufacturing",
          "Motorcycle Manufacturing",
          "Auto Parts & Components",
          "Automotive Electronics",
          "Tire Manufacturing",
          "Automotive Glass",
          "Automotive Interiors",
          "EV Battery Manufacturing",
          "Autonomous Vehicle Development"
        ],
        keywords: ["automotive", "car", "vehicle", "auto", "ev", "electric", "manufacturing"],
        examples: ["Toyota", "Ford", "GM", "Tesla", "Volkswagen", "BMW"]
      },
      "Aerospace & Defense Manufacturing": {
        subIndustries: [
          "Commercial Aircraft",
          "Military Aircraft",
          "Helicopters & Rotorcraft",
          "Space Launch Vehicles",
          "Satellites",
          "Drones / UAVs",
          "Aircraft Engines",
          "Avionics & Navigation",
          "Defense Systems",
          "Missiles & Munitions",
          "Military Vehicles",
          "Naval Vessels",
          "Space Exploration Equipment"
        ],
        keywords: ["aerospace", "aircraft", "defense", "military", "space", "aviation", "satellite"],
        examples: ["Boeing", "Lockheed Martin", "Raytheon", "Northrop Grumman", "SpaceX"]
      },
      "Electronics Manufacturing": {
        subIndustries: [
          "Contract Electronics Manufacturing (EMS)",
          "PCB Manufacturing",
          "Electronic Components",
          "Display Manufacturing",
          "LED Manufacturing",
          "Battery Manufacturing",
          "Cable & Wire Manufacturing",
          "Connector Manufacturing",
          "Sensor Manufacturing",
          "Power Supply Manufacturing"
        ],
        keywords: ["electronics", "pcb", "components", "assembly", "manufacturing"],
        examples: ["Foxconn", "Jabil", "Flex", "Celestica"]
      },
      "Chemical Manufacturing": {
        subIndustries: [
          "Basic Chemicals",
          "Specialty Chemicals",
          "Agricultural Chemicals",
          "Pharmaceutical Chemicals",
          "Plastics & Polymers",
          "Paints & Coatings",
          "Adhesives & Sealants",
          "Industrial Gases",
          "Petrochemicals",
          "Fertilizers",
          "Personal Care Chemicals",
          "Food Additives & Ingredients"
        ],
        keywords: ["chemical", "chemicals", "polymer", "compound", "formulation"],
        examples: ["BASF", "Dow", "DuPont", "LyondellBasell", "3M"]
      },
      "Food & Beverage Manufacturing": {
        subIndustries: [
          "Packaged Food Manufacturing",
          "Dairy Products",
          "Meat Processing",
          "Seafood Processing",
          "Bakery Products",
          "Confectionery & Snacks",
          "Frozen Foods",
          "Canned & Preserved Foods",
          "Beverage Manufacturing",
          "Soft Drinks & Carbonated",
          "Juice & Non-Carbonated",
          "Beer & Breweries",
          "Wine & Spirits",
          "Bottled Water",
          "Coffee & Tea Manufacturing"
        ],
        keywords: ["food manufacturing", "beverage", "processing", "production", "packaging"],
        examples: ["Nestlé", "PepsiCo", "Coca-Cola", "Kraft Heinz", "Tyson Foods"]
      },
      "Textile & Apparel Manufacturing": {
        subIndustries: [
          "Textile Mills",
          "Fabric Manufacturing",
          "Apparel Manufacturing",
          "Footwear Manufacturing",
          "Leather Products",
          "Technical Textiles",
          "Home Textiles",
          "Yarn & Thread",
          "Dyeing & Finishing",
          "Cut & Sew Operations"
        ],
        keywords: ["textile", "fabric", "garment", "apparel", "manufacturing", "fashion"],
        examples: ["Nike Manufacturing", "VF Corporation", "Hanesbrands", "Gildan"]
      },
      "Furniture & Wood Products": {
        subIndustries: [
          "Residential Furniture Manufacturing",
          "Commercial Furniture",
          "Office Furniture",
          "Mattress Manufacturing",
          "Kitchen Cabinet Manufacturing",
          "Millwork & Woodwork",
          "Lumber & Plywood",
          "Engineered Wood",
          "Flooring Manufacturing"
        ],
        keywords: ["furniture", "wood", "manufacturing", "cabinet", "millwork"],
        examples: ["Steelcase", "Herman Miller", "Ashley Furniture", "La-Z-Boy"]
      }
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // REAL ESTATE SECTOR
  // ═══════════════════════════════════════════════════════════════════════════
  "Real Estate": {
    description: "Property development, brokerage, and management. NOT home services or contractors.",
    industries: {
      "Residential Real Estate": {
        subIndustries: [
          "Residential Brokerage",
          "Luxury Real Estate",
          "First-Time Homebuyer Specialists",
          "Relocation Services",
          "New Home Sales",
          "Condo & Co-op Sales",
          "Vacation & Second Home",
          "International Real Estate",
          "Real Estate Auctions",
          "For-Sale-By-Owner Platforms",
          "iBuying Platforms",
          "Buyer's Agents",
          "Seller's Agents"
        ],
        keywords: ["real estate", "realtor", "homes for sale", "property", "mls", "listing", "brokerage", "buy home", "sell home"],
        examples: ["Zillow", "Redfin", "Realtor.com", "Compass", "Keller Williams", "RE/MAX"],
        notKeywords: ["smart home", "installation", "automation", "hvac", "plumbing", "electrical", "contractor"]
      },
      "Commercial Real Estate": {
        subIndustries: [
          "Office Leasing",
          "Retail Leasing",
          "Industrial Leasing",
          "Commercial Sales",
          "Investment Sales",
          "Tenant Representation",
          "Landlord Representation",
          "Commercial Appraisal",
          "Site Selection",
          "Lease Administration"
        ],
        keywords: ["commercial real estate", "office space", "retail space", "industrial", "warehouse", "lease", "tenant"],
        examples: ["CBRE", "JLL", "Cushman & Wakefield", "Colliers", "Newmark"]
      },
      "Property Management": {
        subIndustries: [
          "Residential Property Management",
          "Commercial Property Management",
          "HOA Management",
          "Vacation Rental Management",
          "Student Housing Management",
          "Senior Housing Management",
          "Affordable Housing Management",
          "Self-Storage Management",
          "Facilities Management"
        ],
        keywords: ["property management", "landlord", "tenant", "rent", "maintenance", "lease", "hoa"],
        examples: ["Greystar", "Lincoln Property", "Apartment Management Consultants"]
      },
      "Real Estate Development": {
        subIndustries: [
          "Residential Development",
          "Commercial Development",
          "Mixed-Use Development",
          "Industrial Development",
          "Land Development",
          "Urban Redevelopment",
          "Master-Planned Communities",
          "Affordable Housing Development",
          "Senior Housing Development",
          "Student Housing Development"
        ],
        keywords: ["development", "developer", "construction", "project", "community", "building"],
        examples: ["Lennar", "D.R. Horton", "Toll Brothers", "Related Companies"]
      },
      "Real Estate Technology": {
        subIndustries: [
          "Real Estate Listing Platforms",
          "Property Search Engines",
          "Real Estate CRM",
          "Virtual Tour Technology",
          "Real Estate Transaction Platforms",
          "Title & Closing Tech",
          "Property Data & Analytics",
          "Real Estate Investment Platforms",
          "Proptech Solutions",
          "Smart Building Technology"
        ],
        keywords: ["proptech", "real estate tech", "listing", "search", "virtual tour", "platform"],
        examples: ["Zillow", "Redfin", "CoStar", "Matterport", "Opendoor"]
      }
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // EDUCATION SECTOR
  // ═══════════════════════════════════════════════════════════════════════════
  "Education": {
    description: "Educational institutions, EdTech, and training",
    industries: {
      "K-12 Education": {
        subIndustries: [
          "Public Schools",
          "Private Schools",
          "Charter Schools",
          "Magnet Schools",
          "Montessori Schools",
          "Waldorf Schools",
          "Religious/Parochial Schools",
          "Boarding Schools",
          "International Schools",
          "Homeschool Resources",
          "Tutoring Services",
          "Test Prep (SAT, ACT)",
          "After-School Programs",
          "Early Childhood Education"
        ],
        keywords: ["school", "education", "student", "teacher", "curriculum", "grade", "learning"],
        examples: ["KIPP", "Success Academy", "Kumon", "Sylvan Learning"]
      },
      "Higher Education": {
        subIndustries: [
          "Universities",
          "Liberal Arts Colleges",
          "Community Colleges",
          "Technical Colleges",
          "Graduate Schools",
          "Business Schools (MBA)",
          "Law Schools",
          "Medical Schools",
          "Engineering Schools",
          "Art & Design Schools",
          "Music Conservatories",
          "Culinary Schools",
          "Trade Schools",
          "Online Universities"
        ],
        keywords: ["university", "college", "degree", "campus", "admission", "undergraduate", "graduate"],
        examples: ["Harvard", "Stanford", "MIT", "ASU Online", "Southern New Hampshire University"]
      },
      "Online Learning & EdTech": {
        subIndustries: [
          "MOOC Platforms",
          "Online Course Marketplaces",
          "Learning Management Systems (LMS)",
          "Corporate Training Platforms",
          "Language Learning Apps",
          "Coding Bootcamps",
          "Data Science Bootcamps",
          "UX/UI Bootcamps",
          "K-12 EdTech",
          "Assessment & Testing Platforms",
          "Educational Games",
          "Virtual Classrooms",
          "Student Information Systems",
          "Adaptive Learning Platforms"
        ],
        keywords: ["online learning", "edtech", "course", "training", "bootcamp", "certification", "e-learning"],
        examples: ["Coursera", "Udemy", "Khan Academy", "Codecademy", "Duolingo", "LinkedIn Learning"]
      },
      "Professional Training": {
        subIndustries: [
          "Professional Certification",
          "Continuing Education",
          "Executive Education",
          "Leadership Development",
          "Sales Training",
          "Technical Certification",
          "IT Training",
          "Healthcare Training",
          "Financial Training (CFA, CPA)",
          "Project Management Training",
          "Soft Skills Training",
          "Compliance Training",
          "Safety Training"
        ],
        keywords: ["training", "certification", "professional development", "workshop", "seminar"],
        examples: ["General Assembly", "Pluralsight", "Skillsoft", "Dale Carnegie"]
      }
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // HOSPITALITY SECTOR
  // ═══════════════════════════════════════════════════════════════════════════
  "Hospitality": {
    description: "Hotels, restaurants, travel, and tourism",
    industries: {
      "Hotels & Lodging": {
        subIndustries: [
          "Luxury Hotels",
          "Boutique Hotels",
          "Full-Service Hotels",
          "Select-Service Hotels",
          "Extended Stay Hotels",
          "Budget Hotels",
          "Resorts",
          "Casino Hotels",
          "Conference & Convention Hotels",
          "Airport Hotels",
          "Bed & Breakfast",
          "Hostels",
          "Vacation Rentals",
          "Timeshares",
          "Glamping & Eco-Lodges"
        ],
        keywords: ["hotel", "resort", "lodging", "stay", "room", "booking", "accommodation", "hospitality"],
        examples: ["Marriott", "Hilton", "Hyatt", "Four Seasons", "Airbnb", "VRBO"]
      },
      "Restaurants & Dining": {
        subIndustries: [
          "Fine Dining",
          "Casual Dining",
          "Fast Casual",
          "Quick Service / Fast Food",
          "Cafes & Coffee Shops",
          "Bars & Pubs",
          "Nightclubs",
          "Food Trucks",
          "Ghost Kitchens",
          "Catering Services",
          "Bakeries & Patisseries",
          "Ice Cream & Dessert Shops",
          "Juice & Smoothie Bars",
          "Pizzerias",
          "Ethnic Restaurants",
          "Steakhouses",
          "Seafood Restaurants",
          "Vegetarian & Vegan Restaurants"
        ],
        keywords: ["restaurant", "dining", "food", "menu", "reservation", "order", "cuisine", "chef"],
        examples: ["McDonald's", "Starbucks", "Chipotle", "Olive Garden", "Cheesecake Factory"]
      },
      "Travel & Tourism": {
        subIndustries: [
          "Online Travel Agencies (OTA)",
          "Travel Agencies (Traditional)",
          "Tour Operators",
          "Destination Management",
          "Travel Booking Platforms",
          "Travel Metasearch",
          "Business Travel Management",
          "Travel Insurance",
          "Cruise Lines",
          "Adventure Travel",
          "Eco-Tourism",
          "Luxury Travel",
          "Group Travel",
          "Solo Travel",
          "Travel Content & Blogs"
        ],
        keywords: ["travel", "trip", "vacation", "booking", "tour", "destination", "flight", "itinerary"],
        examples: ["Expedia", "Booking.com", "TripAdvisor", "Kayak", "Viator"]
      },
      "Event & Conference Services": {
        subIndustries: [
          "Convention Centers",
          "Event Venues",
          "Wedding Venues",
          "Corporate Event Planning",
          "Social Event Planning",
          "Trade Show Organizers",
          "Conference Organizers",
          "Catering & Event Catering",
          "Event Technology",
          "Virtual Event Platforms",
          "Event Staffing",
          "Event Production",
          "Audiovisual Services"
        ],
        keywords: ["event", "conference", "wedding", "venue", "catering", "planning", "reception"],
        examples: ["Eventbrite", "Hopin", "Cvent", "Freeman", "Marriott Events"]
      },
      "Entertainment Venues": {
        subIndustries: [
          "Theme Parks",
          "Water Parks",
          "Amusement Parks",
          "Zoos & Aquariums",
          "Museums",
          "Concert Venues",
          "Theaters (Performing Arts)",
          "Movie Theaters",
          "Sports Stadiums & Arenas",
          "Casinos & Gaming",
          "Bowling Alleys",
          "Escape Rooms",
          "Mini Golf",
          "Go-Kart Tracks",
          "Trampoline Parks"
        ],
        keywords: ["entertainment", "attraction", "park", "experience", "ticket", "visit"],
        examples: ["Disney", "Universal", "Six Flags", "SeaWorld", "AMC Theaters"]
      }
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // MEDIA & ENTERTAINMENT SECTOR
  // ═══════════════════════════════════════════════════════════════════════════
  "Media & Entertainment": {
    description: "Content creation, publishing, gaming, and media distribution",
    industries: {
      "Streaming & Digital Media": {
        subIndustries: [
          "Video Streaming (SVOD)",
          "Ad-Supported Streaming (AVOD)",
          "Music Streaming",
          "Podcast Platforms",
          "Live Streaming Platforms",
          "Audiobook Platforms",
          "Digital Video Platforms",
          "OTT Services",
          "Sports Streaming"
        ],
        keywords: ["streaming", "watch", "listen", "subscribe", "content", "shows", "movies", "music"],
        examples: ["Netflix", "Spotify", "Disney+", "YouTube", "Hulu", "Apple Music"]
      },
      "Gaming": {
        subIndustries: [
          "Video Game Development",
          "Mobile Game Development",
          "Console Games",
          "PC Games",
          "MMO Games",
          "Esports Organizations",
          "Gaming Hardware",
          "Game Streaming",
          "Game Distribution Platforms",
          "Gaming Communities",
          "VR Gaming",
          "Indie Game Development",
          "Gaming Accessories"
        ],
        keywords: ["game", "gaming", "play", "esports", "multiplayer", "console", "pc"],
        examples: ["Electronic Arts", "Activision Blizzard", "Epic Games", "Riot Games", "Steam"]
      },
      "Film & Television": {
        subIndustries: [
          "Film Studios",
          "Television Networks",
          "Production Companies",
          "Animation Studios",
          "Documentary Production",
          "Post-Production & VFX",
          "Film Distribution",
          "Independent Film",
          "Reality TV Production",
          "News Production"
        ],
        keywords: ["film", "movie", "television", "tv", "production", "studio", "entertainment"],
        examples: ["Warner Bros", "Paramount", "Sony Pictures", "Pixar", "Netflix Studios"]
      },
      "Music Industry": {
        subIndustries: [
          "Record Labels",
          "Music Publishing",
          "Music Distribution",
          "Artist Management",
          "Concert Promotion",
          "Music Licensing",
          "Recording Studios",
          "Music Production",
          "Independent Artists",
          "Music Education"
        ],
        keywords: ["music", "artist", "album", "song", "record", "label", "concert"],
        examples: ["Universal Music", "Sony Music", "Warner Music", "Spotify", "Live Nation"]
      },
      "News & Publishing": {
        subIndustries: [
          "Newspapers (Digital & Print)",
          "News Websites",
          "Magazines",
          "Book Publishing",
          "Academic Publishing",
          "Trade Publications",
          "Digital Publishing Platforms",
          "Newsletters",
          "Wire Services",
          "Investigative Journalism",
          "Local News"
        ],
        keywords: ["news", "publishing", "article", "journalism", "magazine", "newspaper", "editorial"],
        examples: ["New York Times", "Washington Post", "Condé Nast", "Penguin Random House"]
      },
      "Advertising & Marketing": {
        subIndustries: [
          "Advertising Agencies",
          "Digital Marketing Agencies",
          "Media Buying Agencies",
          "Creative Agencies",
          "PR Agencies",
          "SEO Agencies",
          "Social Media Marketing",
          "Content Marketing Agencies",
          "Influencer Marketing",
          "Programmatic Advertising",
          "Ad Tech Platforms",
          "Marketing Technology",
          "Brand Strategy",
          "Market Research"
        ],
        keywords: ["advertising", "marketing", "agency", "campaign", "brand", "media", "creative"],
        examples: ["WPP", "Omnicom", "Publicis", "Dentsu", "The Trade Desk"]
      }
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TRANSPORTATION & LOGISTICS SECTOR
  // ═══════════════════════════════════════════════════════════════════════════
  "Transportation & Logistics": {
    description: "Moving people and goods",
    industries: {
      "Logistics & Freight": {
        subIndustries: [
          "Freight Forwarding",
          "Third-Party Logistics (3PL)",
          "Fourth-Party Logistics (4PL)",
          "Trucking & Hauling",
          "LTL (Less-Than-Truckload)",
          "FTL (Full Truckload)",
          "Last-Mile Delivery",
          "Same-Day Delivery",
          "White Glove Delivery",
          "Cold Chain Logistics",
          "Hazmat Transportation",
          "Intermodal Transportation",
          "Drayage",
          "Customs Brokerage",
          "Cross-Border Logistics"
        ],
        keywords: ["logistics", "freight", "shipping", "delivery", "transportation", "trucking", "carrier"],
        examples: ["FedEx", "UPS", "DHL", "XPO Logistics", "C.H. Robinson"]
      },
      "Warehousing": {
        subIndustries: [
          "Distribution Centers",
          "Fulfillment Centers",
          "Cold Storage",
          "Self-Storage",
          "Document Storage",
          "Bonded Warehousing",
          "Hazardous Materials Storage",
          "E-commerce Fulfillment",
          "Cross-Docking",
          "Pick & Pack Services",
          "Inventory Management",
          "Warehouse Automation"
        ],
        keywords: ["warehouse", "storage", "fulfillment", "distribution", "inventory"],
        examples: ["Prologis", "Amazon Fulfillment", "Public Storage", "Iron Mountain"]
      },
      "Airlines & Aviation": {
        subIndustries: [
          "Commercial Airlines",
          "Low-Cost Carriers",
          "Regional Airlines",
          "Charter Airlines",
          "Private Aviation",
          "Air Cargo",
          "Aircraft Leasing",
          "Airport Operations",
          "Ground Handling",
          "Aircraft Maintenance (MRO)",
          "Flight Training",
          "Aviation Fuel",
          "Aerospace Parts & Components"
        ],
        keywords: ["airline", "flight", "aviation", "airport", "travel", "aircraft"],
        examples: ["Delta", "United", "Southwest", "JetBlue", "NetJets"]
      },
      "Ground Transportation": {
        subIndustries: [
          "Public Transit",
          "Rail Freight",
          "Passenger Rail",
          "Bus Services",
          "Rideshare & Ride-Hailing",
          "Car Rentals",
          "Taxi Services",
          "Limousine Services",
          "Shuttle Services",
          "Charter Bus",
          "Medical Transportation",
          "School Transportation",
          "Autonomous Vehicles",
          "Electric Vehicle Fleets"
        ],
        keywords: ["transportation", "ride", "transit", "bus", "train", "rental"],
        examples: ["Uber", "Lyft", "Enterprise", "Hertz", "Amtrak"]
      },
      "Maritime & Shipping": {
        subIndustries: [
          "Container Shipping",
          "Bulk Shipping",
          "Tanker Shipping",
          "Roll-on/Roll-off (RoRo)",
          "Cruise Lines",
          "Ferries",
          "Port Operations",
          "Shipbuilding",
          "Ship Repair & Maintenance",
          "Marine Logistics",
          "Barge Operations",
          "Yacht Services"
        ],
        keywords: ["shipping", "maritime", "ocean", "port", "vessel", "cargo", "cruise"],
        examples: ["Maersk", "MSC", "Carnival Cruise", "Royal Caribbean"]
      },
      "Supply Chain Technology": {
        subIndustries: [
          "Transportation Management Systems (TMS)",
          "Warehouse Management Systems (WMS)",
          "Supply Chain Planning",
          "Demand Forecasting",
          "Order Management",
          "Inventory Optimization",
          "Fleet Management",
          "Route Optimization",
          "Supply Chain Visibility",
          "Procurement Platforms",
          "Freight Marketplaces"
        ],
        keywords: ["supply chain", "logistics tech", "platform", "optimization", "management"],
        examples: ["Oracle SCM", "SAP SCM", "Blue Yonder", "project44", "Flexport"]
      }
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // GOVERNMENT SECTOR
  // ═══════════════════════════════════════════════════════════════════════════
  "Government": {
    description: "Public sector and government services",
    industries: {
      "Federal Government": {
        subIndustries: [
          "Executive Branch Agencies",
          "Legislative Offices",
          "Judicial Branch",
          "Defense & Military",
          "Intelligence Agencies",
          "Federal Law Enforcement",
          "Federal Healthcare (VA, NIH)",
          "Federal Education (DOE)",
          "Environmental Agencies (EPA)",
          "Financial Regulators",
          "Social Security Administration",
          "Immigration Services"
        ],
        keywords: ["federal", "government", "agency", "department", ".gov"],
        examples: ["USA.gov", "IRS.gov", "SSA.gov", "CDC.gov"]
      },
      "State & Local Government": {
        subIndustries: [
          "State Government Agencies",
          "County Government",
          "City/Municipal Government",
          "School Districts",
          "Public Libraries",
          "Parks & Recreation",
          "Public Works",
          "State Courts",
          "DMV Services",
          "Public Health Departments",
          "Economic Development",
          "Planning & Zoning"
        ],
        keywords: ["state", "county", "city", "municipal", "public", "government"],
        examples: ["California.gov", "NYC.gov", "Texas.gov"]
      },
      "Government Contractors": {
        subIndustries: [
          "Defense Contractors",
          "IT Contractors (GovTech)",
          "Construction Contractors",
          "Consulting Contractors",
          "Healthcare Contractors",
          "Professional Services",
          "Research & Development",
          "Logistics Contractors",
          "Facilities Management",
          "Security Contractors"
        ],
        keywords: ["contractor", "government", "federal", "contract", "procurement"],
        examples: ["Booz Allen Hamilton", "Leidos", "SAIC", "General Dynamics IT"]
      }
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // NON-PROFIT SECTOR
  // ═══════════════════════════════════════════════════════════════════════════
  "Non-profit": {
    description: "Charitable, advocacy, and social organizations",
    industries: {
      "Charitable Organizations": {
        subIndustries: [
          "Human Services",
          "Food Banks & Hunger Relief",
          "Housing & Shelter",
          "Disaster Relief",
          "Children's Charities",
          "Youth Development",
          "Elder Services",
          "Disability Services",
          "Veterans Services",
          "Community Development",
          "International Aid",
          "Poverty Alleviation"
        ],
        keywords: ["charity", "donate", "nonprofit", "help", "support", "mission", "cause"],
        examples: ["Red Cross", "Salvation Army", "United Way", "Feeding America"]
      },
      "Foundations & Grants": {
        subIndustries: [
          "Private Foundations",
          "Community Foundations",
          "Corporate Foundations",
          "Family Foundations",
          "Operating Foundations",
          "Grantmaking Organizations",
          "Philanthropic Advisors",
          "Donor-Advised Funds"
        ],
        keywords: ["foundation", "grant", "philanthropy", "endowment", "giving"],
        examples: ["Bill & Melinda Gates Foundation", "Ford Foundation", "Rockefeller Foundation"]
      },
      "Advocacy & Social Justice": {
        subIndustries: [
          "Civil Rights Organizations",
          "Environmental Advocacy",
          "Human Rights Organizations",
          "Political Advocacy",
          "Women's Rights",
          "LGBTQ+ Advocacy",
          "Immigration Advocacy",
          "Animal Welfare",
          "Policy Think Tanks",
          "Voting Rights",
          "Labor Unions",
          "Professional Associations"
        ],
        keywords: ["advocacy", "rights", "justice", "campaign", "policy", "activism"],
        examples: ["ACLU", "NAACP", "Sierra Club", "Amnesty International", "PETA"]
      },
      "Religious Organizations": {
        subIndustries: [
          "Churches",
          "Mosques",
          "Synagogues",
          "Temples",
          "Religious Schools",
          "Faith-Based Charities",
          "Religious Media",
          "Missionary Organizations",
          "Interfaith Organizations"
        ],
        keywords: ["church", "faith", "worship", "religious", "ministry", "congregation"],
        examples: ["Catholic Charities", "Salvation Army", "Habitat for Humanity"]
      }
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PROFESSIONAL SERVICES SECTOR
  // ═══════════════════════════════════════════════════════════════════════════
  "Professional Services": {
    description: "Legal, consulting, and professional business services",
    industries: {
      "Legal Services": {
        subIndustries: [
          "Personal Injury Law",
          "Car Accident Attorneys",
          "Slip & Fall Attorneys",
          "Medical Malpractice Law",
          "Wrongful Death Attorneys",
          "Family Law & Divorce",
          "Child Custody Attorneys",
          "Child Support Attorneys",
          "Adoption Attorneys",
          "Criminal Defense",
          "DUI / DWI Defense",
          "Drug Crime Defense",
          "White Collar Crime Defense",
          "Federal Criminal Defense",
          "Immigration Law",
          "Visa & Green Card Attorneys",
          "Deportation Defense",
          "Asylum & Refugee Law",
          "Estate Planning & Probate",
          "Wills & Trusts Attorneys",
          "Probate Attorneys",
          "Elder Law",
          "Bankruptcy Law",
          "Chapter 7 Bankruptcy",
          "Chapter 13 Bankruptcy",
          "Business Bankruptcy",
          "Business & Corporate Law",
          "Business Formation Attorneys",
          "Contract Attorneys",
          "Mergers & Acquisitions Law",
          "Real Estate Law",
          "Commercial Real Estate Attorneys",
          "Landlord-Tenant Attorneys",
          "Employment Law",
          "Wrongful Termination",
          "Workplace Discrimination",
          "Sexual Harassment Attorneys",
          "Workers' Compensation Law",
          "Social Security Disability",
          "Intellectual Property Law",
          "Patent Attorneys",
          "Trademark Attorneys",
          "Copyright Attorneys",
          "Tax Law & Tax Attorneys",
          "IRS Tax Resolution",
          "Class Action Law",
          "Mass Tort Litigation",
          "Civil Rights Law",
          "Police Brutality Attorneys",
          "Product Liability Law",
          "Construction Law",
          "Maritime & Admiralty Law",
          "Aviation Law",
          "Entertainment Law",
          "Sports Law",
          "Environmental Law",
          "HOA & Condo Law",
          "Motorcycle Accident Attorneys",
          "Truck Accident Attorneys",
          "Pedestrian Accident Attorneys",
          "Bicycle Accident Attorneys",
          "Nursing Home Abuse Attorneys",
          "Birth Injury Attorneys",
          "Mesothelioma Attorneys",
          "Veterans Disability Attorneys"
        ],
        keywords: ["lawyer", "attorney", "law firm", "legal", "counsel", "litigation", "lawsuit", "injury", "defense", "court"],
        examples: ["Morgan & Morgan", "Cellino & Barnes", "Jacoby & Meyers", "LegalZoom"]
      },
      "Business Consulting": {
        subIndustries: [
          "Management Consulting",
          "Strategy Consulting",
          "Operations Consulting",
          "HR Consulting",
          "Change Management Consulting",
          "Process Improvement (Lean/Six Sigma)",
          "Supply Chain Consulting",
          "Franchise Consulting",
          "Business Coaching",
          "Executive Coaching",
          "Sales Consulting",
          "Marketing Consulting",
          "Small Business Consulting",
          "Startup Consulting",
          "Exit Planning & Business Sales",
          "Business Valuation Services",
          "Turnaround Consulting",
          "Risk Management Consulting",
          "Sustainability Consulting",
          "Diversity & Inclusion Consulting"
        ],
        keywords: ["consulting", "consultant", "advisory", "strategy", "business", "management"],
        examples: ["McKinsey", "BCG", "Bain", "Deloitte Consulting", "Accenture"]
      },
      "Staffing & Recruiting": {
        subIndustries: [
          "Executive Search / Headhunters",
          "IT Staffing",
          "Healthcare Staffing",
          "Accounting & Finance Staffing",
          "Legal Staffing",
          "Engineering Staffing",
          "Industrial & Manufacturing Staffing",
          "Administrative Staffing",
          "Temp Agencies",
          "Direct Hire Recruiting",
          "RPO (Recruitment Process Outsourcing)",
          "Gig Worker Platforms",
          "Background Check Services",
          "HR Outsourcing (PEO)",
          "Payroll Services"
        ],
        keywords: ["staffing", "recruiting", "hiring", "talent", "jobs", "employment", "temp", "headhunter"],
        examples: ["Robert Half", "Randstad", "Kelly Services", "ManpowerGroup", "Kforce"]
      },
      "Translation & Interpretation": {
        subIndustries: [
          "Document Translation",
          "Legal Translation",
          "Medical Translation",
          "Technical Translation",
          "Website Localization",
          "Simultaneous Interpretation",
          "Court Interpreters",
          "Medical Interpreters",
          "Sign Language Interpretation",
          "Transcription Services"
        ],
        keywords: ["translation", "interpreter", "language", "localization", "bilingual"],
        examples: ["TransPerfect", "Lionbridge", "SDL", "LanguageLine"]
      },
      "Notary & Document Services": {
        subIndustries: [
          "Notary Public",
          "Mobile Notary",
          "Remote Online Notary (RON)",
          "Loan Signing Agents",
          "Apostille Services",
          "Document Preparation",
          "Process Servers",
          "Court Filing Services"
        ],
        keywords: ["notary", "notarize", "signing", "documents", "apostille"],
        examples: ["Notarize", "Signet", "National Notary Association"]
      },
      "Security Services": {
        subIndustries: [
          "Security Guard Services",
          "Armed Security Guards",
          "Unarmed Security Guards",
          "Security Officer Services",
          "Event Security",
          "Concert Security",
          "Wedding Security",
          "Corporate Security",
          "Patrol Services",
          "Mobile Patrol",
          "Foot Patrol",
          "Vehicle Patrol",
          "Executive Protection",
          "Bodyguard Services",
          "VIP Protection",
          "Celebrity Security",
          "Security Consulting",
          "Risk Assessment",
          "Security Assessment",
          "Alarm System Installation",
          "Burglar Alarm Installation",
          "Alarm Monitoring",
          "24/7 Monitoring Service",
          "Video Surveillance Installation",
          "CCTV Installation",
          "Security Camera Installation",
          "IP Camera Installation",
          "Access Control Installation",
          "Keycard Systems",
          "Biometric Access Control",
          "Intercom Systems",
          "Gate Access Systems",
          "Fire Alarm Installation",
          "Fire Alarm Monitoring",
          "Private Investigation",
          "Private Investigator",
          "Background Check Services",
          "Pre-Employment Screening",
          "Loss Prevention",
          "Retail Security",
          "Construction Site Security",
          "Warehouse Security",
          "Hospital Security",
          "School Security"
        ],
        keywords: ["security", "guard", "patrol", "alarm", "surveillance", "protection", "monitoring"],
        examples: ["ADT", "Vivint", "SimpliSafe", "Allied Universal", "Securitas", "G4S"]
      },
      "Answering & Communication Services": {
        subIndustries: [
          "Answering Service",
          "Live Answering Service",
          "24/7 Answering Service",
          "Virtual Receptionist",
          "Remote Receptionist",
          "Call Center Services",
          "Inbound Call Center",
          "Outbound Call Center",
          "Appointment Scheduling Service",
          "Medical Answering Service",
          "Legal Answering Service",
          "Real Estate Answering Service",
          "HVAC Answering Service",
          "After-Hours Answering",
          "Overflow Call Handling",
          "Bilingual Answering Service",
          "Spanish Answering Service",
          "Order Taking Service",
          "Customer Service Outsourcing",
          "Help Desk Services",
          "Technical Support Outsourcing"
        ],
        keywords: ["answering service", "receptionist", "call center", "phone service", "virtual assistant"],
        examples: ["Ruby Receptionists", "AnswerConnect", "PATLive", "Smith.ai", "Davinci Virtual"]
      },
      "Personal & Concierge Services": {
        subIndustries: [
          "Personal Assistant",
          "Virtual Personal Assistant",
          "Executive Assistant Services",
          "Concierge Services",
          "Lifestyle Concierge",
          "Corporate Concierge",
          "Residential Concierge",
          "Hotel Concierge",
          "Errand Services",
          "Errand Running",
          "Personal Shopping",
          "Grocery Shopping Service",
          "Gift Buying Service",
          "Wardrobe Styling",
          "Personal Stylist",
          "Image Consulting",
          "Professional Organizer",
          "Home Organizing",
          "Closet Organizing",
          "Garage Organizing",
          "Office Organizing",
          "Digital Organizing",
          "Move-In Unpacking",
          "Move-Out Packing",
          "Estate Organizing",
          "Downsizing Consultant",
          "Senior Move Manager",
          "Decluttering Services",
          "KonMari Consultant",
          "Hoarding Specialist",
          "Paper Management",
          "Home Inventory Services",
          "Waiting in Line Service",
          "House Sitting",
          "Home Watch Service",
          "Vacation Home Check",
          "Mail & Package Service"
        ],
        keywords: ["concierge", "personal assistant", "errand", "organizing", "organizer", "lifestyle"],
        examples: ["TaskRabbit", "Thumbtack", "NAPO members", "Luxury Attache"]
      },
      "Courier & Delivery Services": {
        subIndustries: [
          "Same-Day Courier",
          "On-Demand Courier",
          "Rush Delivery",
          "Hot Shot Delivery",
          "Medical Courier",
          "Lab Specimen Courier",
          "Pharmacy Delivery",
          "Prescription Delivery",
          "Legal Courier",
          "Document Delivery",
          "Court Filing Delivery",
          "Bank Courier",
          "Check Courier",
          "Interoffice Courier",
          "Scheduled Route Delivery",
          "White Glove Delivery",
          "Fragile Item Delivery",
          "Refrigerated Delivery",
          "Temperature-Controlled Delivery",
          "Catering Delivery",
          "Grocery Delivery Service",
          "Meal Delivery Service",
          "Package Delivery",
          "Last-Mile Delivery",
          "E-commerce Fulfillment",
          "Returns Processing"
        ],
        keywords: ["courier", "delivery", "messenger", "same day", "rush", "express"],
        examples: ["UPS", "FedEx", "DHL", "OnTrac", "LaserShip", "Postmates", "DoorDash"]
      },
      "Mail & Shipping Services": {
        subIndustries: [
          "Pack & Ship Store",
          "Shipping Store",
          "Mailbox Rental",
          "PO Box Alternative",
          "Private Mailbox",
          "Package Receiving",
          "Package Holding",
          "Mail Forwarding",
          "Virtual Mailbox",
          "Digital Mailbox",
          "Business Mail Service",
          "Mail Scanning Service",
          "International Shipping",
          "Freight Shipping Broker",
          "LTL Freight",
          "Customs Broker",
          "Export Services",
          "Packing Services",
          "Crating Services",
          "Palletizing Services"
        ],
        keywords: ["shipping", "mail", "mailbox", "pack and ship", "freight", "postal"],
        examples: ["The UPS Store", "FedEx Office", "PostNet", "Pak Mail", "iPostal1"]
      }
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // HOME SERVICES SECTOR
  // ═══════════════════════════════════════════════════════════════════════════
  "Home Services": {
    description: "Residential and commercial property services, trades, and contractors",
    industries: {
      "HVAC Services": {
        subIndustries: [
          "Residential HVAC",
          "Commercial HVAC",
          "AC Installation",
          "AC Repair",
          "Heating Installation",
          "Furnace Repair",
          "Heat Pump Services",
          "Ductless Mini-Split Installation",
          "Duct Cleaning & Repair",
          "Indoor Air Quality",
          "HVAC Maintenance Plans",
          "Emergency HVAC Repair",
          "Geothermal HVAC",
          "Radiant Heating",
          "Boiler Services",
          "Commercial Refrigeration"
        ],
        keywords: ["hvac", "heating", "cooling", "air conditioning", "ac", "furnace", "duct", "heat pump"],
        examples: ["One Hour Heating & Air", "Aire Serv", "Service Experts"]
      },
      "Plumbing Services": {
        subIndustries: [
          "Residential Plumbing",
          "Commercial Plumbing",
          "Emergency Plumbing",
          "Drain Cleaning",
          "Sewer Line Repair",
          "Sewer Line Replacement",
          "Water Heater Installation",
          "Tankless Water Heater",
          "Water Heater Repair",
          "Leak Detection",
          "Pipe Repair & Replacement",
          "Repiping Services",
          "Gas Line Services",
          "Sump Pump Installation",
          "Water Softener Installation",
          "Water Filtration Systems",
          "Backflow Testing",
          "Hydro Jetting",
          "Trenchless Sewer Repair",
          "Septic Tank Services",
          "Septic Pumping",
          "Bathroom Plumbing",
          "Kitchen Plumbing",
          "Faucet & Fixture Installation",
          "Garbage Disposal Installation",
          "Well Pump Services"
        ],
        keywords: ["plumber", "plumbing", "drain", "pipe", "leak", "sewer", "water heater", "faucet"],
        examples: ["Roto-Rooter", "Mr. Rooter", "Benjamin Franklin Plumbing", "ARS Rescue Rooter"]
      },
      "Electrical Services": {
        subIndustries: [
          "Residential Electrical",
          "Commercial Electrical",
          "Electrical Panel Upgrade",
          "Electrical Panel Replacement",
          "Circuit Breaker Repair",
          "Wiring & Rewiring",
          "Outlet Installation",
          "Light Fixture Installation",
          "Ceiling Fan Installation",
          "Recessed Lighting",
          "Landscape Lighting",
          "Security Lighting",
          "EV Charger Installation",
          "Generator Installation",
          "Whole House Generator",
          "Standby Generator",
          "Surge Protection",
          "Smoke Detector Installation",
          "Electrical Safety Inspection",
          "Emergency Electrical Repair",
          "Knob & Tube Replacement",
          "Aluminum Wiring Replacement",
          "Commercial Tenant Improvement Electrical",
          "Industrial Electrical",
          "Data & Network Cabling",
          "Home Theater Wiring"
        ],
        keywords: ["electrician", "electrical", "wiring", "outlet", "panel", "circuit", "generator", "lighting"],
        examples: ["Mr. Electric", "Mister Sparky", "Arc Angel Electric"]
      },
      "Roofing Services": {
        subIndustries: [
          "Residential Roofing",
          "Commercial Roofing",
          "Roof Replacement",
          "Roof Repair",
          "Roof Inspection",
          "Asphalt Shingle Roofing",
          "Metal Roofing",
          "Tile Roofing",
          "Slate Roofing",
          "Flat Roofing",
          "TPO Roofing",
          "EPDM Roofing",
          "Modified Bitumen Roofing",
          "Built-Up Roofing (BUR)",
          "Cedar Shake Roofing",
          "Synthetic Roofing",
          "Roof Coating",
          "Roof Ventilation",
          "Skylight Installation",
          "Gutter Installation",
          "Gutter Repair",
          "Gutter Guards",
          "Soffit & Fascia",
          "Emergency Roof Repair",
          "Storm Damage Repair",
          "Hail Damage Repair",
          "Roof Leak Repair",
          "Commercial Roof Maintenance"
        ],
        keywords: ["roofing", "roofer", "roof", "shingle", "gutter", "leak", "storm damage"],
        examples: ["CentiMark", "Tecta America", "GAF Master Elite Contractors"]
      },
      "Painting Services": {
        subIndustries: [
          "Residential Interior Painting",
          "Residential Exterior Painting",
          "Commercial Painting",
          "Industrial Painting",
          "Cabinet Painting",
          "Cabinet Refinishing",
          "Deck Staining",
          "Fence Staining",
          "Wallpaper Installation",
          "Wallpaper Removal",
          "Drywall Repair & Painting",
          "Popcorn Ceiling Removal",
          "Texture Matching",
          "Faux Finishing",
          "Epoxy Floor Coating",
          "Garage Floor Coating",
          "Pressure Washing & Painting",
          "HOA Painting",
          "Apartment Painting",
          "Office Painting"
        ],
        keywords: ["painting", "painter", "paint", "staining", "wallpaper", "interior", "exterior"],
        examples: ["CertaPro Painters", "Five Star Painting", "WOW 1 DAY PAINTING"]
      },
      "Landscaping & Lawn Care": {
        subIndustries: [
          "Lawn Mowing",
          "Lawn Maintenance",
          "Lawn Care Programs",
          "Lawn Fertilization",
          "Weed Control",
          "Lawn Aeration",
          "Lawn Overseeding",
          "Sod Installation",
          "Landscape Design",
          "Landscape Installation",
          "Hardscaping",
          "Patio Installation",
          "Retaining Walls",
          "Outdoor Kitchens",
          "Fire Pits & Fireplaces",
          "Pergolas & Arbors",
          "Irrigation Installation",
          "Sprinkler Repair",
          "Drip Irrigation",
          "Drainage Solutions",
          "French Drains",
          "Tree Planting",
          "Shrub Trimming",
          "Hedge Trimming",
          "Mulching",
          "Garden Bed Installation",
          "Xeriscaping",
          "Native Plant Landscaping",
          "Commercial Landscaping",
          "HOA Landscaping",
          "Snow Removal",
          "Ice Management",
          "Holiday Lighting Installation",
          "Outdoor Lighting",
          "Landscape Lighting Design"
        ],
        keywords: ["landscaping", "lawn", "mowing", "yard", "garden", "irrigation", "sprinkler", "hardscape"],
        examples: ["TruGreen", "Lawn Doctor", "Weed Man", "BrightView"]
      },
      "Tree Services": {
        subIndustries: [
          "Tree Removal",
          "Tree Trimming",
          "Tree Pruning",
          "Stump Grinding",
          "Stump Removal",
          "Emergency Tree Service",
          "Storm Damage Tree Removal",
          "Tree Health Assessment",
          "Tree Disease Treatment",
          "Tree Fertilization",
          "Arborist Consultation",
          "Certified Arborist Services",
          "Land Clearing",
          "Lot Clearing",
          "Brush Removal",
          "Tree Planting",
          "Tree Cabling & Bracing"
        ],
        keywords: ["tree", "arborist", "stump", "trimming", "removal", "pruning"],
        examples: ["Davey Tree", "SavATree", "Bartlett Tree Experts"]
      },
      "Pool & Spa Services": {
        subIndustries: [
          "Pool Cleaning",
          "Pool Maintenance",
          "Pool Repair",
          "Pool Equipment Repair",
          "Pool Pump Repair",
          "Pool Filter Repair",
          "Pool Heater Repair",
          "Pool Resurfacing",
          "Pool Remodeling",
          "Pool Tile Repair",
          "Pool Deck Repair",
          "Pool Deck Resurfacing",
          "Pool Opening & Closing",
          "Pool Winterization",
          "Pool Leak Detection",
          "Pool Acid Wash",
          "Pool Drain & Clean",
          "Inground Pool Installation",
          "Above Ground Pool Installation",
          "Pool Enclosure",
          "Pool Safety Fence",
          "Hot Tub Installation",
          "Hot Tub Repair",
          "Spa Services",
          "Pool Automation",
          "Saltwater Pool Conversion"
        ],
        keywords: ["pool", "swimming", "spa", "hot tub", "jacuzzi", "maintenance", "cleaning"],
        examples: ["Pool Scouts", "America's Swimming Pool Company", "Pinch A Penny"]
      },
      "Pest Control": {
        subIndustries: [
          "General Pest Control",
          "Residential Pest Control",
          "Commercial Pest Control",
          "Ant Control",
          "Cockroach Control",
          "Spider Control",
          "Rodent Control",
          "Mouse Control",
          "Rat Control",
          "Bed Bug Treatment",
          "Bed Bug Heat Treatment",
          "Termite Control",
          "Termite Inspection",
          "Termite Treatment",
          "Termite Baiting",
          "Mosquito Control",
          "Tick Control",
          "Flea Control",
          "Wasp & Bee Removal",
          "Wildlife Removal",
          "Raccoon Removal",
          "Squirrel Removal",
          "Bat Removal",
          "Bird Control",
          "Snake Removal",
          "Organic Pest Control",
          "Fumigation Services"
        ],
        keywords: ["pest", "exterminator", "termite", "rodent", "bug", "insect", "wildlife"],
        examples: ["Terminix", "Orkin", "Rentokil", "Truly Nolen", "Aptive"]
      },
      "Garage Door Services": {
        subIndustries: [
          "Garage Door Installation",
          "Garage Door Replacement",
          "Garage Door Repair",
          "Garage Door Opener Installation",
          "Garage Door Opener Repair",
          "Garage Door Spring Repair",
          "Garage Door Spring Replacement",
          "Garage Door Panel Replacement",
          "Garage Door Maintenance",
          "Emergency Garage Door Repair",
          "Commercial Garage Doors",
          "Roll-Up Doors",
          "Custom Garage Doors",
          "Carriage House Doors",
          "Insulated Garage Doors"
        ],
        keywords: ["garage door", "overhead door", "opener", "spring", "repair"],
        examples: ["Precision Door", "Overhead Door", "Amarr", "Clopay"]
      },
      "Flooring Services": {
        subIndustries: [
          "Hardwood Floor Installation",
          "Hardwood Floor Refinishing",
          "Hardwood Floor Repair",
          "Engineered Hardwood Installation",
          "Laminate Flooring Installation",
          "Vinyl Flooring Installation",
          "LVP (Luxury Vinyl Plank) Installation",
          "LVT (Luxury Vinyl Tile) Installation",
          "Tile Flooring Installation",
          "Ceramic Tile Installation",
          "Porcelain Tile Installation",
          "Natural Stone Flooring",
          "Marble Flooring",
          "Travertine Flooring",
          "Carpet Installation",
          "Carpet Repair",
          "Carpet Stretching",
          "Commercial Carpet Installation",
          "Epoxy Flooring",
          "Polished Concrete",
          "Stained Concrete",
          "Cork Flooring",
          "Bamboo Flooring",
          "Floor Leveling",
          "Subfloor Repair"
        ],
        keywords: ["flooring", "floor", "hardwood", "tile", "carpet", "vinyl", "laminate"],
        examples: ["Floor & Decor", "Empire Today", "Luna Flooring", "LL Flooring"]
      },
      "Kitchen & Bath Remodeling": {
        subIndustries: [
          "Kitchen Remodeling",
          "Full Kitchen Renovation",
          "Kitchen Cabinet Installation",
          "Custom Kitchen Cabinets",
          "Cabinet Refacing",
          "Countertop Installation",
          "Granite Countertops",
          "Quartz Countertops",
          "Marble Countertops",
          "Butcher Block Countertops",
          "Kitchen Backsplash",
          "Kitchen Island Installation",
          "Bathroom Remodeling",
          "Full Bathroom Renovation",
          "Master Bath Remodel",
          "Guest Bath Remodel",
          "Bathroom Vanity Installation",
          "Shower Remodel",
          "Walk-In Shower Installation",
          "Tub-to-Shower Conversion",
          "Bathtub Installation",
          "Freestanding Tub Installation",
          "Bathroom Tile Installation",
          "Bathroom Flooring",
          "Accessibility Bathroom Remodel",
          "Walk-In Tub Installation",
          "Basement Bathroom Addition"
        ],
        keywords: ["kitchen", "bathroom", "remodel", "renovation", "cabinets", "countertop", "bath"],
        examples: ["Bath Fitter", "Re-Bath", "Kitchen Tune-Up", "N-Hance"]
      },
      "Window & Door Services": {
        subIndustries: [
          "Window Replacement",
          "Window Installation",
          "Vinyl Windows",
          "Wood Windows",
          "Fiberglass Windows",
          "Aluminum Windows",
          "Double-Hung Windows",
          "Casement Windows",
          "Bay & Bow Windows",
          "Picture Windows",
          "Skylight Installation",
          "Entry Door Installation",
          "Front Door Replacement",
          "French Door Installation",
          "Sliding Glass Doors",
          "Patio Door Installation",
          "Storm Doors",
          "Screen Door Installation",
          "Window Repair",
          "Foggy Window Repair",
          "Window Glass Replacement",
          "Window Screen Repair",
          "Egress Window Installation"
        ],
        keywords: ["window", "door", "replacement", "installation", "glass"],
        examples: ["Renewal by Andersen", "Pella", "Marvin", "Window World"]
      },
      "Siding & Exterior": {
        subIndustries: [
          "Siding Installation",
          "Siding Replacement",
          "Vinyl Siding",
          "Fiber Cement Siding",
          "James Hardie Siding",
          "Wood Siding",
          "Cedar Siding",
          "Aluminum Siding",
          "Engineered Wood Siding",
          "Stucco Installation",
          "Stucco Repair",
          "EIFS (Synthetic Stucco)",
          "Stone Veneer",
          "Brick Veneer",
          "Exterior Painting",
          "Soffit & Fascia Installation",
          "Trim Installation",
          "Exterior Caulking"
        ],
        keywords: ["siding", "vinyl", "stucco", "exterior", "hardie", "fiber cement"],
        examples: ["James Hardie", "CertainTeed", "LP SmartSide"]
      },
      "Fence & Deck": {
        subIndustries: [
          "Fence Installation",
          "Wood Fence Installation",
          "Vinyl Fence Installation",
          "Chain Link Fence",
          "Aluminum Fence",
          "Wrought Iron Fence",
          "Privacy Fence",
          "Fence Repair",
          "Gate Installation",
          "Automatic Gate Installation",
          "Deck Building",
          "Deck Installation",
          "Wood Deck",
          "Composite Deck",
          "Trex Deck",
          "TimberTech Deck",
          "Deck Repair",
          "Deck Staining",
          "Deck Refinishing",
          "Pergola Installation",
          "Gazebo Installation",
          "Screened Porch",
          "Sunroom Addition",
          "Three-Season Room",
          "Porch Building",
          "Railing Installation"
        ],
        keywords: ["fence", "deck", "pergola", "porch", "railing", "outdoor"],
        examples: ["Trex", "Azek", "Fiberon"]
      },
      "Concrete & Masonry": {
        subIndustries: [
          "Concrete Driveways",
          "Driveway Replacement",
          "Driveway Repair",
          "Concrete Patios",
          "Stamped Concrete",
          "Decorative Concrete",
          "Concrete Sidewalks",
          "Concrete Foundations",
          "Foundation Repair",
          "Foundation Crack Repair",
          "Basement Waterproofing",
          "Crawl Space Repair",
          "Crawl Space Encapsulation",
          "French Drain Installation",
          "Sump Pump Installation",
          "Concrete Leveling",
          "Mudjacking",
          "Polyurethane Foam Leveling",
          "Concrete Sealing",
          "Masonry Repair",
          "Brick Repair",
          "Tuckpointing",
          "Chimney Repair",
          "Chimney Rebuild",
          "Stone Masonry",
          "Block Wall Construction",
          "Retaining Wall",
          "Paver Installation"
        ],
        keywords: ["concrete", "driveway", "foundation", "masonry", "brick", "waterproofing", "basement"],
        examples: ["Foundation Supportworks", "Olshan Foundation", "Ram Jack"]
      },
      "Insulation & Weatherization": {
        subIndustries: [
          "Attic Insulation",
          "Blown-In Insulation",
          "Spray Foam Insulation",
          "Fiberglass Insulation",
          "Cellulose Insulation",
          "Wall Insulation",
          "Crawl Space Insulation",
          "Basement Insulation",
          "Radiant Barrier Installation",
          "Air Sealing",
          "Draft Proofing",
          "Weatherstripping",
          "Energy Audit",
          "Home Energy Assessment",
          "Insulation Removal",
          "Old Insulation Disposal"
        ],
        keywords: ["insulation", "spray foam", "attic", "energy", "weatherization"],
        examples: ["USA Insulation", "Dr. Energy Saver", "RetroFoam"]
      },
      "Handyman Services": {
        subIndustries: [
          "General Handyman",
          "Home Repairs",
          "Furniture Assembly",
          "IKEA Assembly",
          "TV Mounting",
          "Shelf Installation",
          "Door Repair",
          "Drywall Repair",
          "Caulking & Grouting",
          "Weather Stripping",
          "Smoke Detector Installation",
          "Baby Proofing",
          "Senior Home Modifications",
          "Aging in Place Modifications",
          "Grab Bar Installation",
          "Minor Plumbing Repairs",
          "Minor Electrical Repairs",
          "Ceiling Fan Installation",
          "Light Fixture Replacement",
          "Holiday Decoration Installation",
          "Pressure Washing",
          "Gutter Cleaning",
          "Odd Jobs"
        ],
        keywords: ["handyman", "repair", "fix", "install", "assembly", "odd jobs", "home repair"],
        examples: ["Mr. Handyman", "Handyman Connection", "House Doctors", "TaskRabbit"]
      },
      "Home Inspection": {
        subIndustries: [
          "Pre-Purchase Home Inspection",
          "Pre-Sale Home Inspection",
          "New Construction Inspection",
          "Radon Testing",
          "Mold Inspection",
          "Mold Testing",
          "Asbestos Testing",
          "Lead Paint Testing",
          "Termite Inspection",
          "WDI (Wood Destroying Insect) Inspection",
          "Septic Inspection",
          "Well Inspection",
          "Pool Inspection",
          "Roof Inspection",
          "Foundation Inspection",
          "Thermal Imaging Inspection",
          "Sewer Scope Inspection",
          "4-Point Inspection",
          "Wind Mitigation Inspection",
          "Commercial Property Inspection"
        ],
        keywords: ["home inspection", "inspector", "radon", "mold", "testing"],
        examples: ["Pillar To Post", "WIN Home Inspection", "HouseMaster", "AmeriSpec"]
      },
      "Locksmith Services": {
        subIndustries: [
          "Residential Locksmith",
          "Commercial Locksmith",
          "Automotive Locksmith",
          "Emergency Lockout",
          "Lock Rekey",
          "Lock Change",
          "Lock Repair",
          "High Security Locks",
          "Smart Lock Installation",
          "Keyless Entry Installation",
          "Safe Opening",
          "Safe Installation",
          "Master Key Systems",
          "Access Control Systems",
          "Key Duplication",
          "Car Key Replacement",
          "Transponder Key Programming",
          "Key Fob Replacement"
        ],
        keywords: ["locksmith", "lock", "key", "lockout", "security"],
        examples: ["Pop-A-Lock", "Mr. Locksmith"]
      },
      "Appliance Repair": {
        subIndustries: [
          "Refrigerator Repair",
          "Washing Machine Repair",
          "Dryer Repair",
          "Dishwasher Repair",
          "Oven Repair",
          "Stove Repair",
          "Range Repair",
          "Microwave Repair",
          "Garbage Disposal Repair",
          "Ice Maker Repair",
          "Freezer Repair",
          "Wine Cooler Repair",
          "Trash Compactor Repair",
          "Commercial Appliance Repair",
          "Restaurant Equipment Repair"
        ],
        keywords: ["appliance", "repair", "refrigerator", "washer", "dryer", "oven", "dishwasher"],
        examples: ["Mr. Appliance", "Sears Home Services"]
      },
      "Chimney Services": {
        subIndustries: [
          "Chimney Cleaning",
          "Chimney Sweep",
          "Chimney Inspection",
          "Chimney Repair",
          "Chimney Cap Installation",
          "Chimney Liner Installation",
          "Chimney Crown Repair",
          "Chimney Waterproofing",
          "Chimney Rebuild",
          "Fireplace Repair",
          "Fireplace Installation",
          "Gas Fireplace Installation",
          "Wood Stove Installation",
          "Pellet Stove Installation",
          "Dryer Vent Cleaning"
        ],
        keywords: ["chimney", "fireplace", "sweep", "flue", "wood stove"],
        examples: ["CSIA Certified Chimney Sweeps"]
      },
      "Moving & Relocation": {
        subIndustries: [
          "Local Moving Company",
          "Residential Moving",
          "Long-Distance Movers",
          "Interstate Moving",
          "Cross-Country Moving",
          "International Moving",
          "Commercial Moving",
          "Office Moving",
          "Apartment Moving",
          "Senior Moving Specialists",
          "Military Moving",
          "Packing Services",
          "Unpacking Services",
          "Packing Supplies",
          "Loading & Unloading Only",
          "Labor Only Moving",
          "Furniture Moving",
          "Piano Moving",
          "Hot Tub Moving",
          "Safe Moving",
          "Art & Antique Moving",
          "White Glove Moving",
          "Portable Storage Containers",
          "PODS Moving",
          "Storage Unit Facilities",
          "Self-Storage",
          "Climate-Controlled Storage",
          "Vehicle Storage",
          "Boat Storage",
          "RV Storage",
          "Junk Removal",
          "Trash Hauling",
          "Furniture Removal",
          "Appliance Removal",
          "Estate Cleanouts",
          "Hoarding Cleanouts",
          "Foreclosure Cleanouts",
          "Dumpster Rental",
          "Roll-Off Dumpster",
          "Construction Dumpster"
        ],
        keywords: ["moving", "movers", "relocation", "storage", "junk removal", "hauling", "packing"],
        examples: ["Two Men and a Truck", "U-Haul", "PODS", "1-800-GOT-JUNK", "College Hunks"]
      },
      "Furniture & Specialty Repair": {
        subIndustries: [
          "Furniture Repair",
          "Wood Furniture Repair",
          "Furniture Refinishing",
          "Antique Furniture Restoration",
          "Upholstery Repair",
          "Reupholstery Services",
          "Leather Furniture Repair",
          "Patio Furniture Repair",
          "Office Furniture Repair",
          "Watch Repair",
          "Clock Repair",
          "Grandfather Clock Repair",
          "Cuckoo Clock Repair",
          "Jewelry Repair",
          "Ring Sizing",
          "Jewelry Cleaning",
          "Jewelry Restoration",
          "Musical Instrument Repair",
          "Piano Tuning",
          "Piano Repair",
          "Guitar Repair",
          "Violin Repair",
          "Brass Instrument Repair",
          "Woodwind Repair",
          "Drum Repair",
          "Small Engine Repair",
          "Lawn Mower Repair",
          "Chainsaw Repair",
          "Snowblower Repair",
          "Generator Repair",
          "Power Tool Repair",
          "Vacuum Repair",
          "Sewing Machine Repair",
          "Bicycle Repair",
          "Bike Shop",
          "E-Bike Repair",
          "Skateboard Repair",
          "Camera Repair",
          "Lens Repair",
          "Binocular Repair",
          "Telescope Repair"
        ],
        keywords: ["repair", "restoration", "refinishing", "tuning", "fix"],
        examples: ["uBreakiFix (furniture)", "local repair shops"]
      },
      "Consumer Electronics Repair": {
        subIndustries: [
          "Computer Repair",
          "Laptop Repair",
          "Desktop Repair",
          "Mac Repair",
          "Apple Repair",
          "PC Repair",
          "iMac Repair",
          "MacBook Repair",
          "Phone Repair",
          "iPhone Repair",
          "Samsung Repair",
          "Android Phone Repair",
          "Cell Phone Screen Repair",
          "Tablet Repair",
          "iPad Repair",
          "Game Console Repair",
          "PlayStation Repair",
          "Xbox Repair",
          "Nintendo Switch Repair",
          "TV Repair",
          "Smart TV Repair",
          "Data Recovery",
          "Hard Drive Recovery",
          "SSD Recovery",
          "Phone Data Recovery",
          "Virus Removal",
          "Malware Removal",
          "Spyware Removal",
          "Computer Tune-Up",
          "Home Network Setup",
          "WiFi Installation",
          "WiFi Troubleshooting",
          "Router Setup",
          "Mesh Network Installation",
          "Smart Home Setup",
          "Home Theater Installation",
          "Surround Sound Installation",
          "Tech Support for Seniors",
          "Computer Training",
          "Drone Repair"
        ],
        keywords: ["computer repair", "phone repair", "iphone", "laptop", "data recovery", "tech support"],
        examples: ["uBreakiFix", "Geek Squad", "CPR Cell Phone Repair", "iFixit"]
      }
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTOMOTIVE SERVICES SECTOR
  // ═══════════════════════════════════════════════════════════════════════════
  "Automotive Services": {
    description: "Vehicle sales, repair, and maintenance services",
    industries: {
      "Auto Repair & Maintenance": {
        subIndustries: [
          "General Auto Repair",
          "Independent Auto Shop",
          "Dealership Service Center",
          "Oil Change & Lube",
          "Quick Lube Service",
          "Brake Repair",
          "Brake Pad Replacement",
          "Brake Rotor Service",
          "Transmission Repair",
          "Transmission Rebuild",
          "Transmission Flush",
          "Engine Repair",
          "Engine Rebuild",
          "Engine Replacement",
          "Check Engine Light Diagnostics",
          "Auto AC Repair",
          "Auto Heating Repair",
          "Exhaust Repair",
          "Muffler Repair",
          "Catalytic Converter Repair",
          "Suspension Repair",
          "Steering Repair",
          "Wheel Alignment",
          "Tire Rotation",
          "Tire Balancing",
          "Battery Replacement",
          "Alternator Repair",
          "Starter Repair",
          "Electrical Diagnostics",
          "Auto Electrical Repair",
          "Tune-Up Service",
          "Timing Belt Replacement",
          "Water Pump Replacement",
          "Radiator Repair",
          "Cooling System Service",
          "Fuel System Repair",
          "Fuel Injection Service",
          "State Inspection",
          "Emissions Testing",
          "Pre-Purchase Inspection",
          "Fleet Maintenance",
          "Fleet Repair Services"
        ],
        keywords: ["auto repair", "mechanic", "car repair", "garage", "service", "maintenance", "brake", "transmission"],
        examples: ["Midas", "Firestone", "Pep Boys", "Meineke", "AAMCO", "Jiffy Lube"]
      },
      "Tire Services": {
        subIndustries: [
          "Tire Sales",
          "New Tire Installation",
          "Used Tires",
          "Tire Repair",
          "Flat Tire Repair",
          "Tire Rotation",
          "Tire Balancing",
          "Wheel Alignment",
          "TPMS Service",
          "Run-Flat Tires",
          "Performance Tires",
          "All-Season Tires",
          "Winter Tires",
          "Snow Tires",
          "Off-Road Tires",
          "Commercial Truck Tires",
          "Mobile Tire Service",
          "Roadside Tire Assistance"
        ],
        keywords: ["tire", "tires", "wheel", "alignment", "rotation", "flat"],
        examples: ["Discount Tire", "Tire Rack", "America's Tire", "Les Schwab", "Big O Tires"]
      },
      "Auto Body & Collision": {
        subIndustries: [
          "Collision Repair",
          "Auto Body Repair",
          "Dent Repair",
          "Paintless Dent Repair (PDR)",
          "Hail Damage Repair",
          "Bumper Repair",
          "Bumper Replacement",
          "Fender Repair",
          "Frame Straightening",
          "Auto Painting",
          "Paint Matching",
          "Clear Coat Repair",
          "Scratch Repair",
          "Insurance Claim Repair",
          "Classic Car Restoration",
          "Custom Paint Jobs",
          "Vinyl Wrap Installation",
          "Car Wrap",
          "Paint Protection Film (PPF)",
          "Headlight Restoration"
        ],
        keywords: ["body shop", "collision", "auto body", "dent", "paint", "accident repair"],
        examples: ["Caliber Collision", "ABRA Auto Body", "Gerber Collision", "Service King"]
      },
      "Auto Glass": {
        subIndustries: [
          "Windshield Replacement",
          "Windshield Repair",
          "Windshield Chip Repair",
          "Windshield Crack Repair",
          "Side Window Replacement",
          "Rear Window Replacement",
          "Sunroof Repair",
          "Sunroof Replacement",
          "Mobile Auto Glass",
          "ADAS Calibration",
          "Camera Calibration",
          "Auto Glass Tinting"
        ],
        keywords: ["windshield", "auto glass", "glass repair", "chip repair", "window"],
        examples: ["Safelite", "Glass Doctor", "Auto Glass Now"]
      },
      "Auto Detailing": {
        subIndustries: [
          "Full Detail Service",
          "Interior Detailing",
          "Exterior Detailing",
          "Hand Wash",
          "Express Car Wash",
          "Mobile Detailing",
          "Ceramic Coating",
          "Paint Correction",
          "Polishing & Buffing",
          "Waxing",
          "Upholstery Cleaning",
          "Leather Conditioning",
          "Odor Removal",
          "Smoke Smell Removal",
          "Pet Hair Removal",
          "Engine Detailing",
          "Headlight Restoration",
          "RV Detailing",
          "Boat Detailing",
          "Motorcycle Detailing",
          "Fleet Detailing"
        ],
        keywords: ["detailing", "car wash", "detail", "ceramic", "wax", "polish"],
        examples: ["Detail King", "Mister Car Wash"]
      },
      "Car Dealerships": {
        subIndustries: [
          "New Car Dealership",
          "Franchised New Car Dealer",
          "Luxury Car Dealership",
          "Used Car Dealership",
          "Pre-Owned Certified Dealer",
          "Buy Here Pay Here",
          "Independent Used Car Lot",
          "Electric Vehicle Dealership",
          "Hybrid Vehicle Dealership",
          "Truck Dealership",
          "Commercial Vehicle Dealership",
          "Wholesale Auto Dealer",
          "Auto Auction",
          "Online Car Sales",
          "Car Subscription Service"
        ],
        keywords: ["dealership", "dealer", "car sales", "auto sales", "buy car", "new car", "used car"],
        examples: ["AutoNation", "CarMax", "Carvana", "Vroom", "DriveTime"]
      },
      "Motorcycle & Powersports": {
        subIndustries: [
          "Motorcycle Dealership",
          "Used Motorcycle Sales",
          "Motorcycle Repair",
          "Motorcycle Service",
          "Motorcycle Customization",
          "ATV Sales & Service",
          "UTV Sales & Service",
          "Snowmobile Sales & Service",
          "Jet Ski Sales & Service",
          "Scooter Sales & Service",
          "E-Bike Sales & Service",
          "Motorcycle Parts",
          "Motorcycle Accessories",
          "Motorcycle Gear & Apparel"
        ],
        keywords: ["motorcycle", "powersports", "atv", "utv", "harley", "yamaha", "kawasaki"],
        examples: ["Harley-Davidson", "Cycle Gear", "RevZilla"]
      },
      "RV & Camper Services": {
        subIndustries: [
          "RV Dealership",
          "Used RV Sales",
          "RV Repair",
          "RV Service",
          "RV Roof Repair",
          "RV AC Repair",
          "RV Generator Repair",
          "RV Plumbing Repair",
          "RV Electrical Repair",
          "RV Winterization",
          "RV Storage",
          "RV Rental",
          "Camper Sales",
          "Travel Trailer Service",
          "Fifth Wheel Service",
          "Motorhome Service"
        ],
        keywords: ["rv", "camper", "motorhome", "travel trailer", "fifth wheel", "recreational vehicle"],
        examples: ["Camping World", "General RV", "La Mesa RV"]
      },
      "Marine & Boat Services": {
        subIndustries: [
          "Boat Dealership",
          "Used Boat Sales",
          "Boat Repair",
          "Outboard Motor Repair",
          "Inboard Motor Repair",
          "Boat Engine Service",
          "Marine Electronics",
          "Boat Trailer Repair",
          "Boat Detailing",
          "Boat Bottom Painting",
          "Gelcoat Repair",
          "Fiberglass Repair",
          "Boat Storage",
          "Boat Winterization",
          "Marina Services",
          "Boat Rental",
          "Boat Canvas & Upholstery",
          "Jet Ski Repair",
          "Kayak & Canoe Sales"
        ],
        keywords: ["boat", "marine", "yacht", "outboard", "marina", "watercraft"],
        examples: ["MarineMax", "West Marine", "Bass Pro Shops"]
      },
      "Towing & Roadside": {
        subIndustries: [
          "Towing Service",
          "Flatbed Towing",
          "Wheel-Lift Towing",
          "Motorcycle Towing",
          "Heavy Duty Towing",
          "Semi Truck Towing",
          "RV Towing",
          "Long Distance Towing",
          "Emergency Towing",
          "Roadside Assistance",
          "Jump Start Service",
          "Lockout Service",
          "Fuel Delivery",
          "Tire Change Service",
          "Winching Service",
          "Accident Recovery",
          "Impound Lot"
        ],
        keywords: ["towing", "tow truck", "roadside", "emergency", "breakdown"],
        examples: ["AAA", "Urgent.ly", "Agero"]
      }
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // BEAUTY & PERSONAL CARE SECTOR
  // ═══════════════════════════════════════════════════════════════════════════
  "Beauty & Personal Care": {
    description: "Salons, spas, and personal care services",
    industries: {
      "Hair Salons": {
        subIndustries: [
          "Full-Service Hair Salon",
          "Women's Hair Salon",
          "Men's Haircuts",
          "Unisex Hair Salon",
          "Kids Hair Salon",
          "High-End / Luxury Hair Salon",
          "Budget Hair Salon",
          "Hair Coloring",
          "Balayage & Highlights",
          "Hair Extensions",
          "Tape-In Extensions",
          "Keratin Treatments",
          "Brazilian Blowout",
          "Japanese Straightening",
          "Perms & Texture",
          "Bridal Hair",
          "Updos & Styling",
          "Natural Hair Salon",
          "Black Hair Salon",
          "Ethnic Hair Salon",
          "Curly Hair Specialist"
        ],
        keywords: ["salon", "hair", "haircut", "color", "stylist", "hairdresser", "balayage"],
        examples: ["Supercuts", "Great Clips", "Sport Clips", "Ulta Salon", "Drybar"]
      },
      "Barbershops": {
        subIndustries: [
          "Traditional Barbershop",
          "Modern Barbershop",
          "Upscale Barbershop",
          "Kids Barbershop",
          "Fades & Lineups",
          "Beard Trimming",
          "Hot Towel Shave",
          "Straight Razor Shave",
          "Mobile Barber",
          "Barber College"
        ],
        keywords: ["barber", "barbershop", "haircut", "fade", "shave", "beard", "trim"],
        examples: ["Floyd's 99", "Roosters Men's Grooming", "The Art of Shaving"]
      },
      "Nail Salons": {
        subIndustries: [
          "Full-Service Nail Salon",
          "Manicure Services",
          "Pedicure Services",
          "Gel Nails",
          "Acrylic Nails",
          "Dip Powder Nails",
          "SNS Nails",
          "Nail Art",
          "Luxury Spa Pedicure",
          "Paraffin Treatment",
          "Nail Extensions",
          "Press-On Nails",
          "Mobile Nail Services"
        ],
        keywords: ["nail", "manicure", "pedicure", "gel", "acrylic", "nails"],
        examples: ["MiniLuxe", "Glosslab", "Paintbox"]
      },
      "Day Spas": {
        subIndustries: [
          "Full-Service Day Spa",
          "Massage Therapy",
          "Swedish Massage",
          "Deep Tissue Massage",
          "Hot Stone Massage",
          "Sports Massage",
          "Prenatal Massage",
          "Couples Massage",
          "Facials",
          "Anti-Aging Facials",
          "Hydrafacial",
          "Microdermabrasion",
          "Chemical Peels",
          "Body Wraps",
          "Body Scrubs",
          "Aromatherapy",
          "Hydrotherapy",
          "Float Therapy",
          "Salt Room / Halotherapy",
          "Infrared Sauna",
          "Cryotherapy",
          "Couples Spa Packages",
          "Spa Parties",
          "Mobile Spa Services"
        ],
        keywords: ["spa", "massage", "facial", "relaxation", "wellness", "treatment"],
        examples: ["Massage Envy", "Hand & Stone", "Elements Massage", "Burke Williams"]
      },
      "Medical Aesthetics & Med Spa": {
        subIndustries: [
          "Medical Spa (Med Spa)",
          "Botox Injections",
          "Dysport Injections",
          "Xeomin Injections",
          "Dermal Fillers",
          "Juvederm",
          "Restylane",
          "Sculptra",
          "Lip Fillers",
          "Cheek Fillers",
          "Under Eye Fillers",
          "Kybella (Double Chin)",
          "PRP Therapy (Vampire Facial)",
          "Microneedling",
          "RF Microneedling",
          "Laser Skin Resurfacing",
          "IPL Photofacial",
          "Laser Hair Removal",
          "Electrolysis",
          "CoolSculpting",
          "Body Contouring",
          "EmSculpt",
          "Liposuction Alternatives",
          "Skin Tightening",
          "Ultherapy",
          "Thread Lift",
          "IV Therapy",
          "Vitamin Infusions",
          "NAD+ Therapy",
          "Hormone Therapy",
          "Medical Weight Loss",
          "Semaglutide (Ozempic/Wegovy)",
          "B12 Injections",
          "Laser Tattoo Removal",
          "Scar Treatment",
          "Acne Treatment",
          "Rosacea Treatment",
          "Pigmentation Treatment",
          "Vein Treatment",
          "Spider Vein Treatment"
        ],
        keywords: ["medspa", "med spa", "botox", "filler", "laser", "coolsculpting", "aesthetic", "anti-aging", "injectable"],
        examples: ["Ideal Image", "LaserAway", "Ever/Body", "SkinSpirit"]
      },
      "Plastic Surgery": {
        subIndustries: [
          "Plastic Surgery Practice",
          "Cosmetic Surgery Center",
          "Breast Augmentation",
          "Breast Lift",
          "Breast Reduction",
          "Breast Reconstruction",
          "Facelift Surgery",
          "Neck Lift",
          "Eyelid Surgery (Blepharoplasty)",
          "Brow Lift",
          "Rhinoplasty (Nose Job)",
          "Otoplasty (Ear Surgery)",
          "Chin Augmentation",
          "Cheek Implants",
          "Liposuction",
          "Tummy Tuck (Abdominoplasty)",
          "Mommy Makeover",
          "Body Lift",
          "Arm Lift (Brachioplasty)",
          "Thigh Lift",
          "BBL (Brazilian Butt Lift)",
          "Buttock Implants",
          "Gynecomastia Surgery",
          "Hair Transplant",
          "FUE Hair Restoration",
          "FUT Hair Restoration",
          "Reconstructive Surgery",
          "Burn Reconstruction",
          "Hand Surgery",
          "Cleft Lip & Palate Surgery"
        ],
        keywords: ["plastic surgery", "cosmetic surgery", "surgeon", "augmentation", "lift", "rhinoplasty", "liposuction"],
        examples: ["American Society of Plastic Surgeons members", "RealSelf Top Doctors"]
      },
      "Waxing & Hair Removal": {
        subIndustries: [
          "Full-Service Waxing",
          "Brazilian Wax",
          "Bikini Wax",
          "Leg Waxing",
          "Arm Waxing",
          "Eyebrow Waxing",
          "Facial Waxing",
          "Back Waxing",
          "Chest Waxing",
          "Full Body Waxing",
          "Sugaring",
          "Threading",
          "Laser Hair Removal",
          "IPL Hair Removal",
          "Electrolysis"
        ],
        keywords: ["waxing", "wax", "hair removal", "brazilian", "threading", "sugaring"],
        examples: ["European Wax Center", "Waxing the City", "Uni K Wax"]
      },
      "Lash & Brow": {
        subIndustries: [
          "Eyelash Extensions",
          "Classic Lash Extensions",
          "Volume Lash Extensions",
          "Hybrid Lash Extensions",
          "Mega Volume Lashes",
          "Lash Lift",
          "Lash Tint",
          "Lash Fill",
          "Eyebrow Shaping",
          "Eyebrow Tinting",
          "Microblading",
          "Ombre Brows",
          "Powder Brows",
          "Brow Lamination",
          "Henna Brows"
        ],
        keywords: ["lash", "lashes", "brow", "eyebrow", "microblading", "extensions"],
        examples: ["The Lash Lounge", "Amazing Lash Studio", "Deka Lash"]
      },
      "Tanning": {
        subIndustries: [
          "Tanning Salon",
          "UV Tanning Beds",
          "Stand-Up Tanning",
          "Spray Tan",
          "Airbrush Tan",
          "Sunless Tanning",
          "Custom Spray Tan",
          "Mobile Spray Tan",
          "Red Light Therapy",
          "Infrared Tanning"
        ],
        keywords: ["tanning", "tan", "spray tan", "sunless", "bronze"],
        examples: ["Palm Beach Tan", "Sun Tan City", "Planet Fitness Black Card"]
      },
      "Tattoo & Piercing": {
        subIndustries: [
          "Tattoo Studio",
          "Custom Tattoo Design",
          "Traditional Tattoo",
          "Realism Tattoo",
          "Watercolor Tattoo",
          "Blackwork Tattoo",
          "Japanese Tattoo",
          "Cover-Up Tattoo",
          "Tattoo Removal",
          "Body Piercing",
          "Ear Piercing",
          "Nose Piercing",
          "Septum Piercing",
          "Belly Button Piercing",
          "Dermal Piercing",
          "Industrial Piercing",
          "Permanent Makeup",
          "Cosmetic Tattooing",
          "Scalp Micropigmentation"
        ],
        keywords: ["tattoo", "piercing", "ink", "body art", "tattoo artist"],
        examples: ["Inkbox", "Claire's (piercing)"]
      },
      "Makeup Services": {
        subIndustries: [
          "Makeup Artist",
          "Bridal Makeup",
          "Special Occasion Makeup",
          "Editorial Makeup",
          "Film & TV Makeup",
          "Airbrush Makeup",
          "Makeup Lessons",
          "Group Makeup Parties",
          "On-Location Makeup",
          "Special Effects Makeup"
        ],
        keywords: ["makeup", "mua", "bridal", "artist", "beauty"],
        examples: ["Sephora services", "MAC Pro", "Glamsquad"]
      }
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CLEANING SERVICES SECTOR
  // ═══════════════════════════════════════════════════════════════════════════
  "Cleaning Services": {
    description: "Residential and commercial cleaning services",
    industries: {
      "Residential Cleaning": {
        subIndustries: [
          "Regular House Cleaning",
          "Weekly Cleaning",
          "Bi-Weekly Cleaning",
          "Monthly Cleaning",
          "Deep Cleaning",
          "Spring Cleaning",
          "Move-In Cleaning",
          "Move-Out Cleaning",
          "Post-Construction Cleaning",
          "Post-Renovation Cleaning",
          "Vacation Rental Cleaning",
          "Airbnb Cleaning",
          "Apartment Cleaning",
          "Condo Cleaning",
          "Townhouse Cleaning",
          "Luxury Home Cleaning",
          "Estate Cleaning",
          "Green Cleaning",
          "Eco-Friendly Cleaning",
          "Maid Service"
        ],
        keywords: ["house cleaning", "maid", "cleaning service", "home cleaning", "housekeeping"],
        examples: ["Molly Maid", "Merry Maids", "The Maids", "Two Maids & A Mop", "Handy"]
      },
      "Commercial Cleaning": {
        subIndustries: [
          "Office Cleaning",
          "Janitorial Services",
          "Commercial Janitorial",
          "Medical Office Cleaning",
          "Dental Office Cleaning",
          "Healthcare Facility Cleaning",
          "Hospital Cleaning",
          "School Cleaning",
          "Church Cleaning",
          "Retail Store Cleaning",
          "Restaurant Cleaning",
          "Gym & Fitness Center Cleaning",
          "Industrial Cleaning",
          "Warehouse Cleaning",
          "Bank Cleaning",
          "Car Dealership Cleaning",
          "Salon & Spa Cleaning",
          "Day Porter Services",
          "Night Cleaning Services"
        ],
        keywords: ["commercial cleaning", "janitorial", "office cleaning", "business cleaning"],
        examples: ["JAN-PRO", "Jani-King", "Coverall", "ServiceMaster Clean", "ABM"]
      },
      "Specialty Cleaning": {
        subIndustries: [
          "Carpet Cleaning",
          "Steam Carpet Cleaning",
          "Dry Carpet Cleaning",
          "Rug Cleaning",
          "Oriental Rug Cleaning",
          "Upholstery Cleaning",
          "Furniture Cleaning",
          "Mattress Cleaning",
          "Window Cleaning",
          "Residential Window Cleaning",
          "Commercial Window Cleaning",
          "High-Rise Window Cleaning",
          "Pressure Washing",
          "Power Washing",
          "Soft Washing",
          "Driveway Cleaning",
          "Deck Cleaning",
          "Patio Cleaning",
          "Fence Cleaning",
          "House Washing",
          "Roof Cleaning",
          "Gutter Cleaning",
          "Air Duct Cleaning",
          "Dryer Vent Cleaning",
          "Hood Cleaning (Restaurant)",
          "Kitchen Exhaust Cleaning",
          "Floor Cleaning",
          "Floor Waxing",
          "Floor Stripping",
          "Tile & Grout Cleaning",
          "Hardwood Floor Cleaning",
          "Stone Floor Polishing"
        ],
        keywords: ["carpet cleaning", "window cleaning", "pressure washing", "duct cleaning"],
        examples: ["Stanley Steemer", "Chem-Dry", "SERVPRO", "Rainbow International"]
      },
      "Restoration & Damage Cleanup": {
        subIndustries: [
          "Water Damage Restoration",
          "Flood Cleanup",
          "Fire Damage Restoration",
          "Smoke Damage Cleanup",
          "Mold Remediation",
          "Mold Removal",
          "Mold Testing",
          "Storm Damage Cleanup",
          "Wind Damage Restoration",
          "Biohazard Cleanup",
          "Crime Scene Cleanup",
          "Trauma Cleanup",
          "Hoarding Cleanup",
          "Sewage Cleanup",
          "Emergency Restoration",
          "Contents Restoration",
          "Document Drying",
          "Electronics Restoration",
          "Odor Removal",
          "Smoke Odor Removal",
          "Asbestos Removal",
          "Lead Paint Removal"
        ],
        keywords: ["restoration", "water damage", "fire damage", "mold", "cleanup", "remediation"],
        examples: ["SERVPRO", "ServiceMaster Restore", "Belfor", "Rainbow International", "PuroClean"]
      }
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PET SERVICES SECTOR
  // ═══════════════════════════════════════════════════════════════════════════
  "Pet Services": {
    description: "Pet care, grooming, training, and boarding services",
    industries: {
      "Pet Grooming": {
        subIndustries: [
          "Full-Service Pet Grooming",
          "Dog Grooming",
          "Cat Grooming",
          "Breed-Specific Grooming",
          "Show Grooming",
          "Puppy's First Groom",
          "Senior Dog Grooming",
          "Mobile Pet Grooming",
          "Self-Service Dog Wash",
          "Nail Trimming",
          "Teeth Brushing",
          "Ear Cleaning",
          "De-Shedding Treatment",
          "Flea & Tick Treatment",
          "Medicated Baths",
          "Creative Grooming",
          "Asian Fusion Grooming"
        ],
        keywords: ["grooming", "groomer", "dog grooming", "pet grooming", "bath", "haircut"],
        examples: ["PetSmart Grooming", "Petco Grooming", "Aussie Pet Mobile"]
      },
      "Pet Boarding & Daycare": {
        subIndustries: [
          "Dog Boarding",
          "Cat Boarding",
          "Luxury Pet Boarding",
          "Cage-Free Boarding",
          "Dog Daycare",
          "Doggy Daycare",
          "Cat Daycare",
          "Overnight Boarding",
          "Extended Stay Boarding",
          "Holiday Pet Boarding",
          "Kennel Services",
          "Pet Hotel",
          "Pet Resort",
          "Farm Boarding",
          "In-Home Pet Boarding",
          "Small Animal Boarding",
          "Exotic Pet Boarding",
          "Bird Boarding"
        ],
        keywords: ["boarding", "kennel", "daycare", "pet hotel", "dog daycare", "overnight"],
        examples: ["Camp Bow Wow", "Dogtopia", "Pet Paradise", "PetSuites"]
      },
      "Pet Sitting & Dog Walking": {
        subIndustries: [
          "Dog Walking",
          "Dog Walker",
          "Pet Sitting",
          "In-Home Pet Sitting",
          "Overnight Pet Sitting",
          "Cat Sitting",
          "Drop-In Visits",
          "Puppy Visits",
          "Senior Pet Care",
          "Pet Taxi",
          "Pet Transportation",
          "Pet Waste Removal",
          "Pooper Scooper Service",
          "Dog Poop Cleanup"
        ],
        keywords: ["dog walking", "pet sitting", "walker", "sitter", "pet care"],
        examples: ["Rover", "Wag!", "Care.com Pets", "Fetch! Pet Care"]
      },
      "Dog Training": {
        subIndustries: [
          "Puppy Training",
          "Puppy Classes",
          "Basic Obedience",
          "Advanced Obedience",
          "Private Dog Training",
          "Group Dog Training",
          "In-Home Training",
          "Board & Train",
          "Behavior Modification",
          "Aggression Training",
          "Anxiety Training",
          "Separation Anxiety",
          "Leash Reactivity Training",
          "Off-Leash Training",
          "Service Dog Training",
          "Therapy Dog Training",
          "Protection Dog Training",
          "Hunting Dog Training",
          "Agility Training",
          "Trick Training",
          "Canine Good Citizen",
          "E-Collar Training",
          "Positive Reinforcement Training"
        ],
        keywords: ["dog training", "trainer", "obedience", "puppy", "behavior"],
        examples: ["Petco Training", "PetSmart Training", "Bark Busters", "Off Leash K9 Training"]
      },
      "Pet Retail": {
        subIndustries: [
          "Pet Supply Store",
          "Pet Food Store",
          "Premium Pet Food",
          "Raw Pet Food",
          "Pet Boutique",
          "Pet Bakery",
          "Dog Treat Bakery",
          "Pet Toy Store",
          "Aquarium Store",
          "Fish Store",
          "Reptile Store",
          "Bird Store",
          "Small Animal Supplies",
          "Pet Pharmacy",
          "Online Pet Supply"
        ],
        keywords: ["pet store", "pet supplies", "pet food", "dog food", "cat food"],
        examples: ["PetSmart", "Petco", "Pet Supplies Plus", "Chewy", "Hollywood Feed"]
      },
      "Pet Specialty Services": {
        subIndustries: [
          "Pet Photography",
          "Dog Photography",
          "Pet Portraits",
          "Pet Cremation",
          "Pet Burial",
          "Pet Cemetery",
          "Pet Memorial",
          "Pet Microchipping",
          "Pet Insurance Agent",
          "Dog DNA Testing",
          "Pet Relocation",
          "International Pet Transport",
          "Pet Massage",
          "Pet Acupuncture",
          "Pet Physical Therapy",
          "Canine Hydrotherapy",
          "Pet CBD Products"
        ],
        keywords: ["pet cremation", "pet photography", "pet memorial", "pet insurance"],
        examples: ["PetPlan", "Healthy Paws", "Trupanion"]
      }
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // EVENTS & WEDDING SECTOR
  // ═══════════════════════════════════════════════════════════════════════════
  "Events & Wedding": {
    description: "Event planning, wedding services, and party rentals",
    industries: {
      "Wedding Services": {
        subIndustries: [
          "Wedding Planner",
          "Full-Service Wedding Planning",
          "Day-Of Coordinator",
          "Month-Of Coordinator",
          "Destination Wedding Planner",
          "Elopement Planning",
          "Wedding Venue",
          "Barn Wedding Venue",
          "Vineyard Wedding Venue",
          "Beach Wedding Venue",
          "Hotel Wedding Venue",
          "Estate Wedding Venue",
          "Garden Wedding Venue",
          "Rooftop Wedding Venue",
          "Wedding Catering",
          "Wedding Cake Baker",
          "Custom Wedding Cakes",
          "Wedding Florist",
          "Bridal Bouquets",
          "Wedding Centerpieces",
          "Ceremony Flowers",
          "Wedding Photographer",
          "Bridal Portrait Photographer",
          "Engagement Photographer",
          "Wedding Videographer",
          "Wedding Film",
          "Wedding DJ",
          "Wedding Band",
          "Wedding Ceremony Music",
          "String Quartet",
          "Wedding Officiant",
          "Non-Denominational Officiant",
          "Wedding Hair & Makeup",
          "Bridal Makeup Artist",
          "Bridal Hair Stylist",
          "Wedding Dress Boutique",
          "Bridal Shop",
          "Wedding Dress Alterations",
          "Tuxedo Rental",
          "Suit Rental",
          "Wedding Rentals",
          "Wedding Linen Rental",
          "Wedding Furniture Rental",
          "Wedding Tent Rental",
          "Wedding Invitation Designer",
          "Calligraphy Services",
          "Wedding Favors",
          "Wedding Transportation",
          "Limousine Service",
          "Party Bus",
          "Honeymoon Planning"
        ],
        keywords: ["wedding", "bridal", "bride", "groom", "ceremony", "reception", "marriage"],
        examples: ["The Knot", "WeddingWire", "Zola", "David's Bridal", "Men's Wearhouse"]
      },
      "Event Planning": {
        subIndustries: [
          "Corporate Event Planner",
          "Social Event Planner",
          "Party Planner",
          "Birthday Party Planner",
          "Kids Party Planner",
          "Sweet 16 Planner",
          "Quinceañera Planner",
          "Bar/Bat Mitzvah Planner",
          "Baby Shower Planner",
          "Bridal Shower Planner",
          "Retirement Party Planner",
          "Anniversary Party Planner",
          "Graduation Party Planner",
          "Holiday Party Planner",
          "Fundraiser Planner",
          "Gala Planner",
          "Non-Profit Event Planning",
          "Conference Planner",
          "Trade Show Planner",
          "Product Launch Events",
          "Grand Opening Events"
        ],
        keywords: ["event planner", "party", "event planning", "celebration", "birthday", "corporate event"],
        examples: ["PartySlate", "Eventbrite", "Peerspace"]
      },
      "Entertainment & DJs": {
        subIndustries: [
          "DJ Services",
          "Mobile DJ",
          "Club DJ",
          "Corporate DJ",
          "School Dance DJ",
          "Photo Booth Rental",
          "360 Photo Booth",
          "GIF Booth",
          "Magic Mirror Photo Booth",
          "Live Band",
          "Cover Band",
          "Jazz Band",
          "Solo Musician",
          "Magician",
          "Kids Magician",
          "Face Painter",
          "Balloon Artist",
          "Balloon Twister",
          "Caricature Artist",
          "Clown Services",
          "Character Performers",
          "Princess Parties",
          "Superhero Parties",
          "Bounce House Rental",
          "Inflatable Rental",
          "Game Rental",
          "Casino Night Rental",
          "Trivia Host",
          "Emcee Services"
        ],
        keywords: ["dj", "photo booth", "entertainment", "band", "magician", "balloon"],
        examples: ["Shutterbooth", "GigMasters", "The Bash", "Thumbtack"]
      },
      "Party & Event Rentals": {
        subIndustries: [
          "Table & Chair Rental",
          "Tent Rental",
          "Linen Rental",
          "Dinnerware Rental",
          "Flatware Rental",
          "Glassware Rental",
          "Furniture Rental",
          "Lounge Furniture Rental",
          "Dance Floor Rental",
          "Staging Rental",
          "Lighting Rental",
          "Event Lighting",
          "String Lights",
          "Uplighting",
          "AV Equipment Rental",
          "Sound System Rental",
          "Projector Rental",
          "Portable Bar Rental",
          "Arch & Backdrop Rental",
          "Draping Rental",
          "Chuppah Rental",
          "Heater & Fan Rental",
          "Generator Rental",
          "Portable Restroom Rental",
          "Luxury Restroom Trailer"
        ],
        keywords: ["rental", "party rental", "event rental", "tent", "table", "chair"],
        examples: ["Party Rental Ltd", "CORT Events", "Taylor Rental"]
      },
      "Catering & Food Service": {
        subIndustries: [
          "Full-Service Catering",
          "Corporate Catering",
          "Wedding Catering",
          "Private Event Catering",
          "Drop-Off Catering",
          "BBQ Catering",
          "Mexican Catering",
          "Italian Catering",
          "Asian Catering",
          "Mediterranean Catering",
          "Vegan Catering",
          "Kosher Catering",
          "Halal Catering",
          "Farm-to-Table Catering",
          "Food Truck Catering",
          "Bartending Service",
          "Mobile Bar Service",
          "Cocktail Catering",
          "Personal Chef",
          "Meal Prep Service"
        ],
        keywords: ["catering", "caterer", "food service", "private chef"],
        examples: ["ezCater", "Cater2me", "ZeroCater"]
      },
      "Florists": {
        subIndustries: [
          "Full-Service Florist",
          "Event Florist",
          "Wedding Florist",
          "Sympathy & Funeral Flowers",
          "Everyday Flowers",
          "Same-Day Flower Delivery",
          "Subscription Flowers",
          "Tropical Flower Specialist",
          "Dried Flower Arrangements",
          "Artificial Flower Arrangements",
          "Plant Delivery",
          "Succulent Arrangements",
          "Corporate Flower Service",
          "Flower Bar"
        ],
        keywords: ["florist", "flowers", "floral", "bouquet", "arrangement", "delivery"],
        examples: ["1-800-Flowers", "FTD", "Teleflora", "The Bouqs", "UrbanStems"]
      }
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PHOTOGRAPHY & CREATIVE SECTOR
  // ═══════════════════════════════════════════════════════════════════════════
  "Photography & Creative": {
    description: "Photography, videography, and creative services",
    industries: {
      "Photography Services": {
        subIndustries: [
          "Portrait Photography",
          "Family Portrait Photography",
          "Senior Portrait Photography",
          "Headshot Photography",
          "Corporate Headshots",
          "Actor Headshots",
          "LinkedIn Headshots",
          "Wedding Photography",
          "Engagement Photography",
          "Elopement Photography",
          "Event Photography",
          "Corporate Event Photography",
          "Conference Photography",
          "Party Photography",
          "Real Estate Photography",
          "Architectural Photography",
          "Interior Design Photography",
          "Commercial Photography",
          "Product Photography",
          "E-commerce Photography",
          "Food Photography",
          "Restaurant Photography",
          "Fashion Photography",
          "Editorial Photography",
          "Newborn Photography",
          "Maternity Photography",
          "Baby Photography",
          "Cake Smash Photography",
          "Boudoir Photography",
          "Sports Photography",
          "Youth Sports Photography",
          "School Photography",
          "Yearbook Photography",
          "Drone Photography",
          "Aerial Photography",
          "Landscape Photography",
          "Fine Art Photography",
          "Photo Restoration"
        ],
        keywords: ["photographer", "photography", "photos", "portraits", "pictures", "shoot"],
        examples: ["Lifetouch", "JCPenney Portraits", "Shutterfly"]
      },
      "Videography & Film": {
        subIndustries: [
          "Wedding Videography",
          "Wedding Films",
          "Event Videography",
          "Corporate Video Production",
          "Promotional Videos",
          "Commercial Production",
          "Documentary Production",
          "Music Video Production",
          "Real Estate Video",
          "Drone Videography",
          "YouTube Video Production",
          "Social Media Video",
          "TikTok Video Creation",
          "Live Streaming Services",
          "Webcast Production",
          "Training Video Production",
          "Testimonial Videos",
          "Animation",
          "Motion Graphics",
          "Video Editing Services",
          "Post-Production",
          "Color Grading",
          "Audio Post-Production"
        ],
        keywords: ["videographer", "video", "film", "production", "drone", "filming"],
        examples: ["WeddingWire Videographers"]
      },
      "Graphic & Web Design": {
        subIndustries: [
          "Graphic Design",
          "Logo Design",
          "Brand Identity Design",
          "Print Design",
          "Marketing Collateral",
          "Brochure Design",
          "Business Card Design",
          "Signage Design",
          "Packaging Design",
          "Book Cover Design",
          "Album Cover Design",
          "Social Media Graphics",
          "Infographic Design",
          "Presentation Design",
          "Web Design",
          "Website Design",
          "Landing Page Design",
          "E-commerce Design",
          "UI/UX Design",
          "Mobile App Design",
          "Email Template Design",
          "Newsletter Design"
        ],
        keywords: ["graphic design", "designer", "logo", "branding", "web design"],
        examples: ["99designs", "Fiverr", "DesignCrowd"]
      },
      "Interior Design": {
        subIndustries: [
          "Residential Interior Design",
          "Commercial Interior Design",
          "Office Interior Design",
          "Restaurant Design",
          "Hotel Design",
          "Retail Store Design",
          "Healthcare Interior Design",
          "Kitchen Design",
          "Bathroom Design",
          "Home Staging",
          "Virtual Staging",
          "Color Consultation",
          "E-Design / Virtual Design",
          "Feng Shui Consulting",
          "Space Planning",
          "Furniture Selection",
          "Window Treatment Design",
          "Lighting Design",
          "Art Consultation"
        ],
        keywords: ["interior design", "designer", "decorator", "staging", "interiors"],
        examples: ["Havenly", "Modsy", "Decorist"]
      }
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CHILDREN & FAMILY SERVICES SECTOR
  // ═══════════════════════════════════════════════════════════════════════════
  "Children & Family Services": {
    description: "Childcare, education, and family-focused services",
    industries: {
      "Childcare": {
        subIndustries: [
          "Daycare Center",
          "Childcare Center",
          "Preschool",
          "Pre-K Program",
          "Montessori Preschool",
          "Waldorf Preschool",
          "Reggio Emilia Preschool",
          "In-Home Daycare",
          "Family Daycare",
          "Corporate Childcare",
          "Drop-In Childcare",
          "Backup Childcare",
          "Before & After School Care",
          "Infant Care",
          "Toddler Care",
          "Summer Camp",
          "Day Camp",
          "Specialty Camp",
          "STEM Camp",
          "Sports Camp",
          "Art Camp",
          "Nanny Services",
          "Nanny Agency",
          "Au Pair Agency",
          "Babysitting Service",
          "Mother's Helper"
        ],
        keywords: ["daycare", "childcare", "preschool", "nanny", "babysitter", "child care", "pre-k"],
        examples: ["KinderCare", "Bright Horizons", "The Learning Experience", "Primrose Schools"]
      },
      "Tutoring & Academic": {
        subIndustries: [
          "Math Tutoring",
          "Reading Tutoring",
          "Writing Tutoring",
          "Science Tutoring",
          "Chemistry Tutoring",
          "Physics Tutoring",
          "Biology Tutoring",
          "History Tutoring",
          "Foreign Language Tutoring",
          "Spanish Tutoring",
          "French Tutoring",
          "Mandarin Tutoring",
          "ESL Tutoring",
          "SAT Prep",
          "ACT Prep",
          "GRE Prep",
          "GMAT Prep",
          "LSAT Prep",
          "MCAT Prep",
          "AP Exam Prep",
          "Homework Help",
          "Study Skills Coaching",
          "Learning Center",
          "After-School Tutoring",
          "Online Tutoring",
          "Homeschool Support",
          "Special Needs Tutoring",
          "Dyslexia Tutoring",
          "Executive Function Coaching"
        ],
        keywords: ["tutoring", "tutor", "test prep", "sat", "act", "academic", "learning"],
        examples: ["Kumon", "Sylvan Learning", "Mathnasium", "Huntington Learning Center", "Varsity Tutors"]
      },
      "Music & Arts Education": {
        subIndustries: [
          "Piano Lessons",
          "Guitar Lessons",
          "Violin Lessons",
          "Drum Lessons",
          "Voice Lessons",
          "Singing Lessons",
          "Music Theory",
          "Music School",
          "Music Academy",
          "Art Classes",
          "Drawing Classes",
          "Painting Classes",
          "Pottery Classes",
          "Sculpture Classes",
          "Art School",
          "Dance Classes",
          "Ballet Classes",
          "Hip Hop Dance",
          "Jazz Dance",
          "Tap Dance",
          "Ballroom Dance",
          "Dance Studio",
          "Theater Classes",
          "Acting Classes",
          "Improv Classes"
        ],
        keywords: ["music lessons", "piano", "guitar", "art classes", "dance", "voice lessons"],
        examples: ["School of Rock", "Music & Arts", "Kindermusik", "Bach to Rock"]
      },
      "Youth Sports & Activities": {
        subIndustries: [
          "Youth Soccer League",
          "Youth Baseball League",
          "Youth Basketball League",
          "Youth Football League",
          "Youth Hockey League",
          "Youth Lacrosse",
          "Youth Volleyball",
          "Youth Tennis",
          "Youth Golf",
          "Youth Swimming",
          "Swim Lessons",
          "Gymnastics Classes",
          "Tumbling Classes",
          "Martial Arts for Kids",
          "Kids Karate",
          "Kids Taekwondo",
          "Kids Jiu Jitsu",
          "Cheerleading",
          "Youth Dance Team",
          "Youth Sports Training",
          "Speed & Agility Training",
          "Sports Performance"
        ],
        keywords: ["youth sports", "kids sports", "little league", "gymnastics", "swim lessons"],
        examples: ["YMCA", "Little League", "USA Swimming", "The Little Gym", "i9 Sports"]
      },
      "Kids Entertainment Venues": {
        subIndustries: [
          "Indoor Playground",
          "Bounce House Facility",
          "Trampoline Park",
          "Kids Play Center",
          "Soft Play Area",
          "Kids Birthday Party Venue",
          "Arcade",
          "Family Entertainment Center",
          "Mini Golf",
          "Go-Karts for Kids",
          "Laser Tag",
          "Kids Bowling",
          "Build-A-Bear",
          "Kids Cooking Classes",
          "Kids Science Center",
          "Children's Museum"
        ],
        keywords: ["kids party", "birthday party", "trampoline park", "bounce house", "playground"],
        examples: ["Chuck E. Cheese", "Sky Zone", "Urban Air", "Pump It Up"]
      }
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // AGRICULTURE & FARMING SECTOR
  // ═══════════════════════════════════════════════════════════════════════════
  "Agriculture & Farming": {
    description: "Farms, ranches, nurseries, and agricultural services",
    industries: {
      "Farms & Ranches": {
        subIndustries: [
          "Vegetable Farm",
          "Organic Vegetable Farm",
          "Fruit Farm",
          "Orchard",
          "Apple Orchard",
          "Citrus Farm",
          "Berry Farm",
          "Dairy Farm",
          "Cattle Ranch",
          "Beef Ranch",
          "Sheep Farm",
          "Goat Farm",
          "Pig Farm",
          "Poultry Farm",
          "Chicken Farm",
          "Egg Farm",
          "Turkey Farm",
          "Horse Farm",
          "Horse Ranch",
          "Alpaca Farm",
          "Bison Ranch",
          "Fish Farm",
          "Aquaculture",
          "Oyster Farm",
          "Shrimp Farm",
          "Grain Farm",
          "Corn Farm",
          "Wheat Farm",
          "Soybean Farm",
          "Cotton Farm",
          "Hemp Farm",
          "Lavender Farm",
          "Flower Farm",
          "Christmas Tree Farm",
          "Pumpkin Patch",
          "U-Pick Farm"
        ],
        keywords: ["farm", "ranch", "agriculture", "organic", "livestock", "produce", "harvest"],
        examples: ["Organic Valley", "Driscoll's", "Earthbound Farm"]
      },
      "Wineries & Breweries": {
        subIndustries: [
          "Winery",
          "Vineyard",
          "Wine Tasting Room",
          "Estate Winery",
          "Urban Winery",
          "Craft Brewery",
          "Microbrewery",
          "Brewpub",
          "Taproom",
          "Distillery",
          "Craft Distillery",
          "Whiskey Distillery",
          "Vodka Distillery",
          "Gin Distillery",
          "Rum Distillery",
          "Cidery",
          "Hard Cider",
          "Meadery",
          "Sake Brewery"
        ],
        keywords: ["winery", "vineyard", "brewery", "distillery", "craft beer", "wine", "tasting"],
        examples: ["Stone Brewing", "Sierra Nevada", "Robert Mondavi", "Deschutes Brewery"]
      },
      "Nurseries & Garden Centers": {
        subIndustries: [
          "Garden Center",
          "Plant Nursery",
          "Wholesale Nursery",
          "Tree Nursery",
          "Shrub Nursery",
          "Perennial Nursery",
          "Annual Nursery",
          "Native Plant Nursery",
          "Succulent Nursery",
          "Tropical Plant Nursery",
          "Indoor Plant Shop",
          "Houseplant Store",
          "Orchid Nursery",
          "Rose Nursery",
          "Herb Nursery",
          "Vegetable Starts",
          "Seed Company",
          "Hydroponics Store",
          "Aquaponics Supply",
          "Garden Supply Store",
          "Landscape Supply",
          "Mulch & Soil Supplier",
          "Compost Supplier"
        ],
        keywords: ["nursery", "garden center", "plants", "trees", "shrubs", "landscaping", "gardening"],
        examples: ["Pike Nurseries", "Armstrong Garden Centers", "Monrovia"]
      },
      "Agricultural Services": {
        subIndustries: [
          "Farm Equipment Dealer",
          "Tractor Dealer",
          "Farm Equipment Repair",
          "Farm Supply Store",
          "Feed Store",
          "Seed Dealer",
          "Fertilizer Supplier",
          "Pesticide Applicator",
          "Crop Dusting",
          "Aerial Application",
          "Irrigation Installation",
          "Irrigation Repair",
          "Farm Consulting",
          "Agronomist Services",
          "Soil Testing",
          "Farm Management",
          "Custom Harvesting",
          "Hay & Straw Sales",
          "Farm Labor Contractor",
          "Agricultural Lending"
        ],
        keywords: ["farm equipment", "tractor", "feed", "seed", "agricultural", "farming"],
        examples: ["John Deere", "Tractor Supply", "Helena Agri-Enterprises"]
      },
      "Beekeeping & Apiary": {
        subIndustries: [
          "Beekeeping",
          "Apiary",
          "Honey Production",
          "Local Honey",
          "Raw Honey",
          "Artisan Honey",
          "Bee Removal",
          "Pollination Services",
          "Beekeeping Supplies",
          "Beekeeping Classes",
          "Queen Bee Breeding"
        ],
        keywords: ["beekeeping", "honey", "bees", "apiary", "pollination"],
        examples: ["Local Hive", "Really Raw Honey"]
      },
      "Agritourism": {
        subIndustries: [
          "Farm Tours",
          "Winery Tours",
          "Brewery Tours",
          "Farm-to-Table Dining",
          "Farm Stay",
          "Dude Ranch",
          "Guest Ranch",
          "Agritourism Events",
          "Corn Maze",
          "Hay Rides",
          "Petting Zoo",
          "Farm Wedding Venue",
          "Farm Event Venue"
        ],
        keywords: ["agritourism", "farm tour", "winery tour", "farm stay", "dude ranch"],
        examples: ["Harvest Hosts", "Hipcamp"]
      }
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CANNABIS INDUSTRY SECTOR
  // ═══════════════════════════════════════════════════════════════════════════
  "Cannabis Industry": {
    description: "Legal cannabis retail, cultivation, and CBD products",
    industries: {
      "Cannabis Retail": {
        subIndustries: [
          "Cannabis Dispensary",
          "Recreational Dispensary",
          "Medical Dispensary",
          "Cannabis Delivery Service",
          "Cannabis Lounge",
          "Consumption Lounge",
          "Online Cannabis Store",
          "Cannabis Accessories Shop"
        ],
        keywords: ["dispensary", "cannabis", "marijuana", "weed", "pot", "recreational", "medical marijuana"],
        examples: ["MedMen", "Curaleaf", "Trulieve", "Stiiizy", "Cookies"]
      },
      "CBD & Hemp Products": {
        subIndustries: [
          "CBD Store",
          "CBD Shop",
          "Hemp Store",
          "CBD Oil",
          "CBD Gummies",
          "CBD Topicals",
          "CBD for Pets",
          "Delta-8 THC",
          "Delta-9 THC",
          "THC-A Products",
          "Hemp Flower",
          "CBD Beverages",
          "CBD Wellness Products"
        ],
        keywords: ["cbd", "hemp", "cannabidiol", "delta-8", "thc", "wellness"],
        examples: ["Charlotte's Web", "Lazarus Naturals", "cbdMD", "Joy Organics"]
      },
      "Cannabis Cultivation": {
        subIndustries: [
          "Cannabis Cultivation Facility",
          "Indoor Cannabis Grow",
          "Outdoor Cannabis Farm",
          "Greenhouse Cannabis",
          "Craft Cannabis Cultivation",
          "Hemp Cultivation",
          "Cannabis Nursery",
          "Cannabis Genetics",
          "Cannabis Seed Bank"
        ],
        keywords: ["cultivation", "grow", "grower", "cannabis farm", "hemp farm"],
        examples: ["Tikun Olam", "Canopy Growth"]
      },
      "Cannabis Processing & Manufacturing": {
        subIndustries: [
          "Cannabis Extraction",
          "Concentrate Manufacturing",
          "Edible Manufacturing",
          "Cannabis Beverage Manufacturing",
          "Vape Cartridge Manufacturing",
          "Pre-Roll Manufacturing",
          "Infused Product Manufacturing",
          "Cannabis Testing Lab",
          "Cannabis Packaging"
        ],
        keywords: ["extraction", "concentrate", "edible", "manufacturing", "processing"],
        examples: ["PAX", "Select", "Wyld"]
      },
      "Cannabis Services": {
        subIndustries: [
          "Cannabis Consulting",
          "Dispensary Consulting",
          "Cannabis License Consulting",
          "Cannabis Marketing Agency",
          "Cannabis Branding",
          "Cannabis Compliance",
          "Cannabis Security",
          "Cannabis Software",
          "Cannabis POS Systems",
          "Cannabis Real Estate",
          "Cannabis Insurance",
          "Cannabis Accounting",
          "Canna-Tourism"
        ],
        keywords: ["cannabis consulting", "dispensary consulting", "cannabis business"],
        examples: ["Flowhub", "Dutchie", "LeafLink", "Metrc"]
      }
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // FUNERAL & MEMORIAL SERVICES SECTOR
  // ═══════════════════════════════════════════════════════════════════════════
  "Funeral & Memorial Services": {
    description: "Funeral homes, cremation, cemeteries, and memorial services",
    industries: {
      "Funeral Services": {
        subIndustries: [
          "Full-Service Funeral Home",
          "Traditional Funeral Home",
          "Family-Owned Funeral Home",
          "Corporate Funeral Home",
          "Funeral Director",
          "Funeral Planning",
          "Pre-Need Funeral Planning",
          "At-Need Funeral Services",
          "Graveside Service",
          "Memorial Service",
          "Celebration of Life",
          "Military Funeral Honors",
          "Religious Funeral Services",
          "Non-Religious Funeral Services",
          "Viewing & Visitation",
          "Funeral Reception",
          "Grief Counseling",
          "Bereavement Support"
        ],
        keywords: ["funeral", "funeral home", "mortuary", "death", "memorial", "burial"],
        examples: ["Dignity Memorial", "Service Corporation International", "Carriage Services"]
      },
      "Cremation Services": {
        subIndustries: [
          "Cremation Service",
          "Direct Cremation",
          "Cremation with Service",
          "Crematory",
          "Cremation Urns",
          "Cremation Jewelry",
          "Scattering Service",
          "Ash Scattering",
          "Cremation Memorial",
          "Aquamation (Water Cremation)",
          "Alkaline Hydrolysis"
        ],
        keywords: ["cremation", "crematory", "urn", "ashes", "direct cremation"],
        examples: ["Neptune Society", "Trident Society"]
      },
      "Cemeteries & Burial": {
        subIndustries: [
          "Cemetery",
          "Memorial Park",
          "Lawn Cemetery",
          "Garden Cemetery",
          "Historic Cemetery",
          "Veterans Cemetery",
          "Religious Cemetery",
          "Catholic Cemetery",
          "Jewish Cemetery",
          "Muslim Cemetery",
          "Pet Cemetery",
          "Green Burial",
          "Natural Burial Ground",
          "Eco-Friendly Burial",
          "Mausoleum",
          "Columbarium",
          "Family Mausoleum",
          "Burial Plot Sales",
          "Cemetery Maintenance"
        ],
        keywords: ["cemetery", "burial", "grave", "plot", "memorial park", "mausoleum"],
        examples: ["Forest Lawn", "Rose Hills Memorial Park"]
      },
      "Memorial Products": {
        subIndustries: [
          "Headstones & Monuments",
          "Granite Monuments",
          "Bronze Markers",
          "Flat Markers",
          "Upright Headstones",
          "Custom Monuments",
          "Memorial Benches",
          "Memorial Plaques",
          "Caskets",
          "Casket Company",
          "Burial Vaults",
          "Urns",
          "Keepsake Urns",
          "Biodegradable Urns",
          "Memorial Jewelry",
          "Cremation Diamonds",
          "Memorial Trees",
          "Obituary Writing",
          "Memorial Video",
          "Funeral Flowers"
        ],
        keywords: ["headstone", "monument", "casket", "urn", "memorial"],
        examples: ["Matthews International", "Rock of Ages", "Trigard"]
      }
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SPORTS, FITNESS & RECREATION SECTOR
  // ═══════════════════════════════════════════════════════════════════════════
  "Sports, Fitness & Recreation": {
    description: "Gyms, sports facilities, recreation venues, and fitness services",
    industries: {
      "Gyms & Fitness Centers": {
        subIndustries: [
          "Big Box Gym",
          "Budget Gym",
          "24-Hour Gym",
          "Boutique Gym",
          "Luxury Fitness Club",
          "Women's Only Gym",
          "Personal Training Studio",
          "CrossFit Box",
          "CrossFit Affiliate",
          "Functional Fitness Gym",
          "Bodybuilding Gym",
          "Powerlifting Gym",
          "Olympic Weightlifting Gym",
          "Boxing Gym",
          "Kickboxing Gym",
          "MMA Gym",
          "Climbing Gym",
          "Rock Climbing Gym",
          "Bouldering Gym",
          "Swimming Pool Fitness",
          "Aquatic Center",
          "Corporate Fitness Center",
          "Hotel Fitness Center",
          "Apartment Fitness Center"
        ],
        keywords: ["gym", "fitness", "workout", "exercise", "training", "weights"],
        examples: ["Planet Fitness", "LA Fitness", "24 Hour Fitness", "Equinox", "Lifetime Fitness"]
      },
      "Boutique Fitness Studios": {
        subIndustries: [
          "Yoga Studio",
          "Hot Yoga Studio",
          "Vinyasa Yoga",
          "Bikram Yoga",
          "Yin Yoga",
          "Aerial Yoga",
          "Pilates Studio",
          "Reformer Pilates",
          "Mat Pilates",
          "Barre Studio",
          "Pure Barre",
          "Spin Studio",
          "Indoor Cycling",
          "HIIT Studio",
          "Orange Theory Fitness",
          "F45 Training",
          "Boot Camp Classes",
          "Dance Fitness",
          "Zumba Classes",
          "Jazzercise",
          "Pole Fitness",
          "Aerial Fitness",
          "TRX Training",
          "Rowing Fitness",
          "Megaformer",
          "Lagree Fitness"
        ],
        keywords: ["yoga", "pilates", "barre", "cycling", "spin", "hiit", "studio"],
        examples: ["CorePower Yoga", "SoulCycle", "Orangetheory", "Barry's", "Pure Barre"]
      },
      "Martial Arts & Combat Sports": {
        subIndustries: [
          "Karate Dojo",
          "Taekwondo School",
          "Brazilian Jiu Jitsu",
          "Judo School",
          "Aikido Dojo",
          "Kung Fu School",
          "Muay Thai Gym",
          "Kickboxing School",
          "Boxing Training",
          "MMA Training",
          "Self-Defense Classes",
          "Krav Maga",
          "Wing Chun",
          "Hapkido",
          "Capoeira",
          "Fencing Club",
          "Wrestling Training"
        ],
        keywords: ["martial arts", "karate", "taekwondo", "jiu jitsu", "boxing", "mma", "self defense"],
        examples: ["Gracie Barra", "UFC Gym", "9Round", "Title Boxing Club"]
      },
      "Golf": {
        subIndustries: [
          "Golf Course",
          "Public Golf Course",
          "Private Golf Club",
          "Semi-Private Golf Club",
          "Country Club",
          "Golf Resort",
          "Executive Golf Course",
          "Par 3 Golf Course",
          "Driving Range",
          "Golf Practice Facility",
          "Indoor Golf Simulator",
          "Golf Lessons",
          "PGA Instruction",
          "Golf Academy",
          "Junior Golf Programs",
          "Golf Pro Shop",
          "Golf Club Fitting",
          "Golf Cart Sales",
          "Golf Tournament Services"
        ],
        keywords: ["golf", "country club", "driving range", "golf course", "tee time"],
        examples: ["Topgolf", "ClubCorp", "Troon Golf", "PGA Tour Superstore"]
      },
      "Bowling & Entertainment": {
        subIndustries: [
          "Bowling Alley",
          "Boutique Bowling",
          "Cosmic Bowling",
          "Bowling League",
          "Pro Shop (Bowling)",
          "Billiards Hall",
          "Pool Hall",
          "Darts Bar",
          "Shuffleboard Bar",
          "Axe Throwing",
          "Escape Room",
          "Virtual Reality Arcade",
          "Racing Simulator",
          "Golf Simulator Bar",
          "Sports Bar & Games"
        ],
        keywords: ["bowling", "entertainment", "games", "escape room", "axe throwing"],
        examples: ["Bowlero", "Lucky Strike", "Pinstripes", "Main Event"]
      },
      "Ice & Winter Sports": {
        subIndustries: [
          "Ice Skating Rink",
          "Ice Arena",
          "Figure Skating",
          "Hockey Rink",
          "Ice Hockey League",
          "Adult Hockey League",
          "Youth Hockey",
          "Curling Club",
          "Ski Resort",
          "Ski Area",
          "Snowboard Park",
          "Ski Lessons",
          "Ski Rental",
          "Ski Tuning",
          "Cross-Country Skiing"
        ],
        keywords: ["ice skating", "hockey", "skiing", "snowboarding", "ice rink"],
        examples: ["Vail Resorts", "Alterra Mountain Company"]
      },
      "Water Sports & Aquatics": {
        subIndustries: [
          "Swimming Pool",
          "Public Pool",
          "Swim Club",
          "Swim Lessons",
          "Competitive Swimming",
          "Masters Swimming",
          "Water Polo",
          "Diving",
          "Synchronized Swimming",
          "Surfing Lessons",
          "Surf School",
          "Paddle Board Rental",
          "SUP Lessons",
          "Kayak Rental",
          "Kayak Tours",
          "Canoe Rental",
          "Jet Ski Rental",
          "Water Ski",
          "Wakeboarding",
          "Kiteboarding",
          "Scuba Diving",
          "Dive Shop",
          "Snorkeling Tours",
          "Sailing Lessons",
          "Sailing Club",
          "Yacht Club"
        ],
        keywords: ["swimming", "pool", "surf", "paddle", "kayak", "scuba", "water sports"],
        examples: ["Life Time Aquatics", "YMCA Aquatics", "US Masters Swimming"]
      },
      "Tennis & Racquet Sports": {
        subIndustries: [
          "Tennis Club",
          "Tennis Center",
          "Indoor Tennis",
          "Outdoor Tennis",
          "Tennis Lessons",
          "Tennis Academy",
          "Junior Tennis",
          "Adult Tennis League",
          "USTA League Tennis",
          "Pickleball Courts",
          "Pickleball Club",
          "Racquetball Club",
          "Squash Club",
          "Badminton Club",
          "Paddle Tennis",
          "Platform Tennis"
        ],
        keywords: ["tennis", "pickleball", "racquet", "court", "lessons"],
        examples: ["USTA", "Tennis Express", "Life Time Tennis"]
      },
      "Shooting & Archery": {
        subIndustries: [
          "Gun Range",
          "Indoor Shooting Range",
          "Outdoor Shooting Range",
          "Tactical Training",
          "Firearms Training",
          "Concealed Carry Classes",
          "Gun Safety Course",
          "Trap & Skeet Shooting",
          "Sporting Clays",
          "Archery Range",
          "Archery Lessons",
          "Bow Hunting Training",
          "Crossbow Training",
          "Hunting Outfitter",
          "Hunting Guide Service"
        ],
        keywords: ["shooting range", "gun range", "firearms", "archery", "hunting"],
        examples: ["Shoot Point Blank", "Range USA", "Bass Pro Shops (ranges)"]
      }
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CONSTRUCTION & TRADES SECTOR
  // ═══════════════════════════════════════════════════════════════════════════
  "Construction & Trades": {
    description: "General contractors, specialty contractors, and construction services",
    industries: {
      "General Contractors": {
        subIndustries: [
          "Residential General Contractor",
          "Custom Home Builder",
          "Production Home Builder",
          "Spec Home Builder",
          "Luxury Home Builder",
          "Green Home Builder",
          "Modular Home Builder",
          "Log Home Builder",
          "Timber Frame Builder",
          "Home Addition Contractor",
          "Home Renovation Contractor",
          "Whole House Remodel",
          "Historic Home Restoration",
          "Commercial General Contractor",
          "Tenant Improvement Contractor",
          "Restaurant Build-Out",
          "Retail Build-Out",
          "Office Build-Out",
          "Medical Office Construction",
          "Industrial General Contractor",
          "Warehouse Construction",
          "Design-Build Contractor",
          "Construction Management"
        ],
        keywords: ["general contractor", "builder", "home builder", "construction", "remodel", "renovation"],
        examples: ["Lennar", "D.R. Horton", "Toll Brothers", "PulteGroup", "Turner Construction"]
      },
      "Specialty Trade Contractors": {
        subIndustries: [
          "Framing Contractor",
          "Drywall Contractor",
          "Drywall Installation",
          "Drywall Finishing",
          "Taping & Mudding",
          "Texture Contractor",
          "Plastering Contractor",
          "Stucco Contractor",
          "Insulation Contractor",
          "Acoustic Ceiling Contractor",
          "Drop Ceiling Installation",
          "Trim Carpenter",
          "Finish Carpenter",
          "Cabinet Installer",
          "Countertop Installer",
          "Tile Contractor",
          "Tile Installer",
          "Flooring Contractor",
          "Hardwood Floor Installer",
          "Glass & Glazing Contractor",
          "Mirror Installation",
          "Shower Door Installation",
          "Welding Contractor",
          "Structural Steel",
          "Metal Fabrication",
          "Iron Worker",
          "Sheet Metal Contractor"
        ],
        keywords: ["contractor", "drywall", "framing", "tile", "carpenter", "finish work"],
        examples: ["ABC Supply", "BuildersTrend"]
      },
      "Excavation & Site Work": {
        subIndustries: [
          "Excavation Contractor",
          "Site Work Contractor",
          "Land Clearing",
          "Grading Contractor",
          "Demolition Contractor",
          "Residential Demolition",
          "Commercial Demolition",
          "Trenching Service",
          "Utility Trenching",
          "Underground Utilities",
          "Sewer & Water Line Installation",
          "Septic System Installation",
          "Septic System Repair",
          "Well Drilling",
          "Water Well Drilling",
          "Geothermal Drilling",
          "Foundation Contractor",
          "Concrete Foundation",
          "Pier & Beam Foundation",
          "Basement Excavation",
          "Pool Excavation",
          "Pond Construction"
        ],
        keywords: ["excavation", "grading", "demolition", "site work", "trenching", "well drilling"],
        examples: ["Granite Construction", "Primoris Services"]
      },
      "Commercial Construction Specialty": {
        subIndustries: [
          "Healthcare Construction",
          "Hospital Construction",
          "Medical Facility Construction",
          "Educational Construction",
          "School Construction",
          "University Construction",
          "Retail Construction",
          "Shopping Center Construction",
          "Hotel Construction",
          "Hospitality Construction",
          "Restaurant Construction",
          "Multi-Family Construction",
          "Apartment Construction",
          "Senior Living Construction",
          "Data Center Construction",
          "Clean Room Construction",
          "Laboratory Construction",
          "Government Construction",
          "Federal Construction",
          "Infrastructure Construction",
          "Bridge Construction",
          "Highway Construction",
          "Utility Construction"
        ],
        keywords: ["commercial construction", "healthcare construction", "educational", "infrastructure"],
        examples: ["DPR Construction", "McCarthy Building Companies", "Mortenson"]
      }
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PERSONAL & HOUSEHOLD SERVICES SECTOR
  // ═══════════════════════════════════════════════════════════════════════════
  "Personal & Household Services": {
    description: "Laundry, alterations, repair, rental, and personal care services",
    industries: {
      "Laundry & Dry Cleaning": {
        subIndustries: [
          "Dry Cleaner",
          "Dry Cleaning Shop",
          "Eco-Friendly Dry Cleaning",
          "Green Dry Cleaning",
          "Laundromat",
          "Coin Laundry",
          "Self-Service Laundry",
          "Wash & Fold Service",
          "Fluff & Fold",
          "Laundry Service",
          "Pickup & Delivery Laundry",
          "Mobile Laundry Service",
          "Commercial Laundry",
          "Industrial Laundry",
          "Linen Service",
          "Hospital Linen Service",
          "Restaurant Linen Service",
          "Hotel Linen Service",
          "Uniform Cleaning",
          "Uniform Rental & Cleaning",
          "Wedding Dress Cleaning",
          "Wedding Dress Preservation",
          "Gown Preservation",
          "Leather Cleaning",
          "Suede Cleaning",
          "Fur Cleaning",
          "Fur Storage",
          "Rug Cleaning (Dry Clean)",
          "Oriental Rug Cleaning",
          "Drapery Cleaning",
          "Curtain Cleaning",
          "Comforter Cleaning",
          "Down Cleaning",
          "Pillow Cleaning",
          "Shoe Cleaning Service",
          "Sneaker Cleaning",
          "Diaper Service",
          "Cloth Diaper Service"
        ],
        keywords: ["dry cleaning", "laundry", "laundromat", "wash", "cleaning", "linen"],
        examples: ["Tide Cleaners", "CD One Price Cleaners", "Martinizing", "ZIPS Dry Cleaners"]
      },
      "Alterations & Tailoring": {
        subIndustries: [
          "Clothing Alterations",
          "Alterations Shop",
          "Tailoring Services",
          "Tailor Shop",
          "Custom Tailoring",
          "Bespoke Tailoring",
          "Men's Tailoring",
          "Women's Tailoring",
          "Suit Tailoring",
          "Custom Suits",
          "Made-to-Measure Suits",
          "Shirt Tailoring",
          "Custom Shirts",
          "Wedding Dress Alterations",
          "Bridal Alterations",
          "Bridesmaid Dress Alterations",
          "Prom Dress Alterations",
          "Formal Wear Alterations",
          "Tuxedo Alterations",
          "Uniform Alterations",
          "Jeans Hemming",
          "Pants Hemming",
          "Dress Hemming",
          "Jacket Alterations",
          "Coat Alterations",
          "Leather Alterations",
          "Zipper Repair",
          "Zipper Replacement",
          "Button Replacement",
          "Lining Repair",
          "Patching & Mending",
          "Custom Clothing Design",
          "Dressmaker",
          "Seamstress Services"
        ],
        keywords: ["alterations", "tailoring", "tailor", "seamstress", "hemming", "custom"],
        examples: ["Local tailor shops", "Men's Wearhouse alterations"]
      },
      "Shoe & Leather Services": {
        subIndustries: [
          "Shoe Repair",
          "Cobbler",
          "Boot Repair",
          "Cowboy Boot Repair",
          "Work Boot Repair",
          "Heel Replacement",
          "Heel Repair",
          "Sole Replacement",
          "Resoling",
          "Shoe Stretching",
          "Shoe Widening",
          "Shoe Dyeing",
          "Shoe Color Change",
          "Shoe Shining",
          "Shoe Polishing",
          "Sneaker Restoration",
          "Sneaker Cleaning",
          "Sneaker Customization",
          "Leather Repair",
          "Leather Restoration",
          "Handbag Repair",
          "Purse Repair",
          "Luggage Repair",
          "Briefcase Repair",
          "Belt Repair",
          "Wallet Repair",
          "Leather Jacket Repair",
          "Leather Conditioning",
          "Saddle Repair",
          "Tack Repair",
          "Orthopedic Shoe Modification",
          "Custom Orthotics",
          "Shoe Lifts"
        ],
        keywords: ["shoe repair", "cobbler", "leather", "resole", "heel", "boot repair"],
        examples: ["Local cobblers", "Leather Spa"]
      },
      "Print & Sign Services": {
        subIndustries: [
          "Print Shop",
          "Copy Center",
          "Printing Services",
          "Digital Printing",
          "Offset Printing",
          "Large Format Printing",
          "Wide Format Printing",
          "Blueprint Printing",
          "Architectural Printing",
          "Engineering Printing",
          "Poster Printing",
          "Banner Printing",
          "Vinyl Banner",
          "Retractable Banner",
          "Trade Show Displays",
          "Trade Show Booth",
          "Pop-Up Displays",
          "Sign Shop",
          "Sign Company",
          "Custom Signs",
          "Business Signs",
          "Outdoor Signs",
          "Indoor Signs",
          "LED Signs",
          "Neon Signs",
          "Channel Letters",
          "Monument Signs",
          "Pylon Signs",
          "A-Frame Signs",
          "Yard Signs",
          "Political Signs",
          "Real Estate Signs",
          "Vehicle Wraps",
          "Car Wraps",
          "Truck Wraps",
          "Fleet Graphics",
          "Vinyl Lettering",
          "Window Graphics",
          "Wall Graphics",
          "Floor Graphics",
          "Decals & Stickers",
          "Screen Printing",
          "T-Shirt Printing",
          "Custom Apparel Printing",
          "Embroidery Services",
          "Custom Embroidery",
          "Trophy Shop",
          "Awards & Recognition",
          "Custom Trophies",
          "Plaques",
          "Medals",
          "Engraving Services",
          "Laser Engraving",
          "Custom Engraving",
          "Personalized Gifts",
          "Name Badges",
          "ID Cards",
          "Laminating Services",
          "Binding Services",
          "Booklet Printing",
          "Brochure Printing",
          "Business Card Printing",
          "Letterhead Printing",
          "Invitation Printing",
          "Wedding Invitations"
        ],
        keywords: ["print", "printing", "signs", "banners", "engraving", "trophy", "screen printing"],
        examples: ["FedEx Office", "The UPS Store", "Minuteman Press", "AlphaGraphics", "FASTSIGNS"]
      },
      "Equipment & Tool Rental": {
        subIndustries: [
          "Equipment Rental",
          "Tool Rental",
          "Power Tool Rental",
          "Hand Tool Rental",
          "Construction Equipment Rental",
          "Heavy Equipment Rental",
          "Excavator Rental",
          "Backhoe Rental",
          "Skid Steer Rental",
          "Scissor Lift Rental",
          "Boom Lift Rental",
          "Forklift Rental",
          "Scaffolding Rental",
          "Ladder Rental",
          "Concrete Equipment Rental",
          "Concrete Mixer Rental",
          "Compactor Rental",
          "Generator Rental",
          "Compressor Rental",
          "Pressure Washer Rental",
          "Floor Sander Rental",
          "Carpet Cleaner Rental",
          "Tile Saw Rental",
          "Chainsaw Rental",
          "Stump Grinder Rental",
          "Trailer Rental",
          "Utility Trailer Rental",
          "Car Trailer Rental",
          "Moving Truck Rental",
          "Van Rental",
          "Cargo Van Rental",
          "Box Truck Rental",
          "Pickup Truck Rental",
          "Furniture Rental",
          "Staging Furniture Rental",
          "Office Furniture Rental",
          "Appliance Rental",
          "Washer Dryer Rental",
          "Refrigerator Rental",
          "Electronics Rental",
          "TV Rental",
          "Computer Rental",
          "Laptop Rental",
          "Projector Rental",
          "AV Equipment Rental",
          "Camera Rental",
          "Lens Rental",
          "Video Camera Rental",
          "Lighting Rental",
          "Photography Equipment Rental",
          "DJ Equipment Rental",
          "Sound System Rental",
          "PA System Rental",
          "Outdoor Equipment Rental",
          "Camping Gear Rental",
          "Tent Rental (Camping)",
          "Backpack Rental",
          "Ski Rental",
          "Snowboard Rental",
          "Bike Rental",
          "E-Bike Rental",
          "Scooter Rental",
          "Kayak Rental",
          "Paddleboard Rental",
          "Surfboard Rental",
          "Golf Club Rental",
          "Medical Equipment Rental",
          "Wheelchair Rental",
          "Hospital Bed Rental",
          "Oxygen Equipment Rental",
          "Baby Equipment Rental",
          "Stroller Rental",
          "Car Seat Rental",
          "Crib Rental"
        ],
        keywords: ["rental", "rent", "equipment", "tool", "machinery", "truck rental"],
        examples: ["United Rentals", "Sunbelt Rentals", "Home Depot Tool Rental", "Penske", "Budget Truck"]
      }
    }
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Flatten the taxonomy into a simple list of all sub-industries
 * Returns array of: { sector, industry, subIndustry, keywords, notKeywords }
 */
function flattenTaxonomy() {
  const flattened = [];
  
  for (const [sector, sectorData] of Object.entries(INDUSTRY_TAXONOMY)) {
    for (const [industry, industryData] of Object.entries(sectorData.industries)) {
      for (const subIndustry of industryData.subIndustries) {
        flattened.push({
          sector,
          industry,
          subIndustry,
          fullPath: `${sector} > ${industry} > ${subIndustry}`,
          keywords: industryData.keywords || [],
          notKeywords: industryData.notKeywords || [],
          examples: industryData.examples || []
        });
      }
    }
  }
  
  return flattened;
}

/**
 * Get all sub-industries as a simple string array for AI prompting
 */
function getAllSubIndustries() {
  const flattened = flattenTaxonomy();
  return flattened.map(item => item.subIndustry);
}

/**
 * Get all industries (mid-level) as a simple string array
 */
function getAllIndustries() {
  const industries = [];
  for (const sectorData of Object.values(INDUSTRY_TAXONOMY)) {
    industries.push(...Object.keys(sectorData.industries));
  }
  return industries;
}

/**
 * Get all sectors (top-level)
 */
function getAllSectors() {
  return Object.keys(INDUSTRY_TAXONOMY);
}

/**
 * Map a sub-industry to its sector (for schema primaryIndustry)
 */
function mapToSector(subIndustryOrIndustry) {
  if (!subIndustryOrIndustry) return "Other";
  
  const lower = subIndustryOrIndustry.toLowerCase();
  
  for (const [sector, sectorData] of Object.entries(INDUSTRY_TAXONOMY)) {
    for (const [industry, industryData] of Object.entries(sectorData.industries)) {
      // Check industry name match
      if (industry.toLowerCase() === lower) {
        return sector;
      }
      // Check sub-industry match
      for (const subIndustry of industryData.subIndustries) {
        if (subIndustry.toLowerCase() === lower) {
          return sector;
        }
      }
      // Check keyword match
      for (const keyword of industryData.keywords || []) {
        if (lower.includes(keyword)) {
          // But check notKeywords first
          const notKeywords = industryData.notKeywords || [];
          const hasNotKeyword = notKeywords.some(nk => lower.includes(nk));
          if (!hasNotKeyword) {
            return sector;
          }
        }
      }
    }
  }
  
  return "Other";
}

/**
 * Get industry details by name (fuzzy match)
 */
function findIndustryDetails(searchTerm) {
  if (!searchTerm) return null;
  
  const lower = searchTerm.toLowerCase();
  const flattened = flattenTaxonomy();
  
  // Exact sub-industry match
  const exactMatch = flattened.find(item => 
    item.subIndustry.toLowerCase() === lower ||
    item.industry.toLowerCase() === lower
  );
  if (exactMatch) return exactMatch;
  
  // Partial match
  const partialMatch = flattened.find(item =>
    item.subIndustry.toLowerCase().includes(lower) ||
    item.industry.toLowerCase().includes(lower) ||
    item.keywords.some(kw => lower.includes(kw))
  );
  if (partialMatch) return partialMatch;
  
  return null;
}

/**
 * Get statistics about the taxonomy
 */
function getTaxonomyStats() {
  const flattened = flattenTaxonomy();
  const sectors = getAllSectors();
  const industries = getAllIndustries();
  
  return {
    totalSectors: sectors.length,
    totalIndustries: industries.length,
    totalSubIndustries: flattened.length,
    coverage: `${sectors.length} sectors → ${industries.length} industries → ${flattened.length} sub-industries`,
    bySecor: sectors.map(sector => ({
      sector,
      industryCount: Object.keys(INDUSTRY_TAXONOMY[sector].industries).length,
      subIndustryCount: Object.values(INDUSTRY_TAXONOMY[sector].industries)
        .reduce((sum, ind) => sum + ind.subIndustries.length, 0)
    }))
  };
}

module.exports = {
  INDUSTRY_TAXONOMY,
  flattenTaxonomy,
  getAllSubIndustries,
  getAllIndustries,
  getAllSectors,
  mapToSector,
  findIndustryDetails,
  getTaxonomyStats
};

