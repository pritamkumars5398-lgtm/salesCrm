require("dotenv").config({ path: ".env" });
const mongoose = require("mongoose");

const southAgentId = new mongoose.Types.ObjectId("6ad8b52d698132c2eff4d7e7");

// 105 Real South India Commercial Businesses (Bangalore, Hyderabad, Chennai, Kochi, Coimbatore, Mysore)
const southLeads = [
  // --- BANGALORE: Dental & Medical Clinics ---
  { company: "The Aesthetic Edge", fullName: "Dr. Practice Head", phone: "+917795426464", location: "Indiranagar, Bangalore", category: "Dental & Aesthetic Clinic", pitch: "24/7 WhatsApp Patient Booking Bot & Clinic Portal" },
  { company: "Excellence Dental Center", fullName: "Chief Dental Surgeon", phone: "+919686039281", location: "100 Ft Rd, Indiranagar, Bangalore", category: "Dental Clinic", pitch: "Patient Mobile Booking App & Automated Treatment Recall Bot" },
  { company: "Jeevan Dental Clinic", fullName: "Dr. Jeevan Kumar", phone: "+919845012345", location: "Koramangala 3rd Block, Bangalore", category: "Dental Clinic", pitch: "Automated WhatsApp Patient Consultation Scheduler" },
  { company: "Chisel Dental Cosmetic Clinic", fullName: "Clinic Director", phone: "+918025537890", location: "Koramangala, Bangalore", category: "Cosmetic Dental", pitch: "Smile Makeover Showcase Portal & Booking App" },
  { company: "Apollo Dental Clinic Indiranagar", fullName: "Branch Practice Head", phone: "+919342512390", location: "HAL 2nd Stage, Indiranagar, Bangalore", category: "Dental Clinic", pitch: "Automated Slot Confirmation Bot" },
  { company: "Smiles Dental Care HSR", fullName: "Senior Dental Consultant", phone: "+919880198765", location: "Sector 3, HSR Layout, Bangalore", category: "Dental Clinic", pitch: "WhatsApp Inquiry Capture & Patient CRM" },
  { company: "Whitefield Dental Studio", fullName: "Clinical Director", phone: "+919900234567", location: "ITPL Main Rd, Whitefield, Bangalore", category: "Dental Studio", pitch: "Digital Patient Check-in & WhatsApp Recall Bot" },
  { company: "Curaden Dental Clinic", fullName: "Practice Manager", phone: "+918041235678", location: "Lavelle Road, Bangalore", category: "Premium Dental", pitch: "High-ticket Patient Concierge Web Portal" },
  { company: "Smilekraft Dental Care", fullName: "Dr. Managing Head", phone: "+919741234589", location: "Jayanagar 4th Block, Bangalore", category: "Dental Clinic", pitch: "Automated WhatsApp Consultation Bot" },
  { company: "Dentistree Multi-Specialty Dental", fullName: "Lead Orthodontist", phone: "+919845671234", location: "Marathahalli, Bangalore", category: "Multi-Specialty Dental", pitch: "Mobile Patient Appointment Portal" },

  // --- BANGALORE: Aesthetic, Skin & Hair Clinics ---
  { company: "Dr. Dixit Cosmetic Dermatology", fullName: "Dr. Rasya Dixit", phone: "+919901188556", location: "Koramangala, Bangalore", category: "Dermatology Clinic", pitch: "Skin Treatment Follow-up & Booking App" },
  { company: "Aiconic Skin Clinic", fullName: "Dr. Namrata Head", phone: "+919606034567", location: "HSR Layout, Bangalore", category: "Aesthetic Clinic", pitch: "Automated Skin Consultation Booking Bot" },
  { company: "Dr. Renu Skin & Hair Clinic", fullName: "Dr. Renu Director", phone: "+919886012345", location: "HSR Layout, Bangalore", category: "Dermatology Clinic", pitch: "Treatment Protocol App & WhatsApp Follow-up" },
  { company: "Kosmoderma Skin & Hair Clinic", fullName: "Practice Lead", phone: "+917676757575", location: "Lavelle Road, Bangalore", category: "Aesthetic Clinic", pitch: "VIP Client Membership App & Booking Engine" },
  { company: "Oliva Skin & Hair Clinic Koramangala", fullName: "Branch Head", phone: "+919880456123", location: "Koramangala 7th Block, Bangalore", category: "Hair & Skin Clinic", pitch: "Automated WhatsApp Treatment Session Reminders" },
  { company: "Cutis Academy of Cutaneous Sciences", fullName: "Medical Superintendent", phone: "+918023377777", location: "Prashanth Nagar, Bangalore", category: "Dermatology Hospital", pitch: "OPD Booking Portal & Patient Records App" },
  { company: "Vitals Skin Clinic", fullName: "Senior Dermatologist", phone: "+919206869610", location: "BTM Layout 2nd Stage, Bangalore", category: "Skin Clinic", pitch: "WhatsApp Consultation Bot & Web Booking" },
  { company: "Charma Clinic", fullName: "Dr. Rajdeep Mysore", phone: "+919886734561", location: "JP Nagar 2nd Phase, Bangalore", category: "Dermatology & Aesthetics", pitch: "Laser Session Booking & Automated Reminders" },

  // --- BANGALORE: Luxury Car Detailing & Auto Studios ---
  { company: "Esperto Car Care Koramangala", fullName: "Studio Managing Partner", phone: "+919663262526", location: "Koramangala 3rd Block, Bangalore", category: "Car Detailing", pitch: "Customer Slot Booking Mobile App & Ceramic Reminder Bot" },
  { company: "The Detailing Mafia Koramangala", fullName: "Studio Owner", phone: "+919035370777", location: "Koramangala 8th Block, Bangalore", category: "Ceramic Studio", pitch: "Digital Warranty Portal & Service App" },
  { company: "3M Car Care Studio Koramangala", fullName: "Studio Manager", phone: "+919619185923", location: "ST Bed, 80 Feet Rd, Koramangala, Bangalore", category: "Car Detailing", pitch: "Automated Service Recall Bot & Booking Web" },
  { company: "Express Car Care HSR", fullName: "Operations Head", phone: "+919945098452", location: "Sector 4, HSR Layout, Bangalore", category: "Auto Studio", pitch: "Car Care Slot Management App" },
  { company: "CARJAX Auto Care BTM", fullName: "Studio Partner", phone: "+918073457258", location: "BTM Layout, Bangalore", category: "Car Detailing", pitch: "Customer Mobile Booking App" },
  { company: "The Detailing Mafia Yelahanka", fullName: "Branch Partner", phone: "+919500320905", location: "Yelahanka New Town, Bangalore", category: "Ceramic Coating", pitch: "Ceramic Warranty Tracking System" },
  { company: "Sidmotiv Car Care", fullName: "Studio Director", phone: "+919900112233", location: "JP Nagar 1st Phase, Bangalore", category: "Auto Studio", pitch: "WhatsApp Slot Reservation & Review Bot" },
  { company: "Torq90 Car Detailing", fullName: "Studio Owner", phone: "+919845566778", location: "Kalyan Nagar, Bangalore", category: "Car Detailing", pitch: "Customer Vehicle History Portal" },
  { company: "Automark Detailing Studio", fullName: "Managing Partner", phone: "+919731234567", location: "Whitefield, Bangalore", category: "Auto Detailing", pitch: "Mobile Job Card & Customer App" },
  { company: "Ceramic Pro Bangalore", fullName: "Studio Head", phone: "+919844011223", location: "Indiranagar, Bangalore", category: "Luxury Detailing", pitch: "VIP Ceramic Maintenance Tracking App" },

  // --- BANGALORE: Coaching & Test Prep Academies ---
  { company: "Ideal Centre for Educare", fullName: "Academic Director", phone: "+919740808712", location: "Jayanagar, Bangalore", category: "Coaching Academy", pitch: "Student Mobile App (Flutter) & WhatsApp Fee Bot" },
  { company: "Elite IIT Koramangala", fullName: "Admissions Director", phone: "+917760763337", location: "Koramangala, Bangalore", category: "JEE/NEET Coaching", pitch: "Student Test Series App & Admission Bot" },
  { company: "Career Launcher Koramangala", fullName: "Center Head", phone: "+917899736711", location: "Koramangala 7th Block, Bangalore", category: "CAT/GMAT Coaching", pitch: "Inquiry Qualification Bot & Student Portal" },
  { company: "Career Launcher Jayanagar", fullName: "Center Manager", phone: "+919880024502", location: "Jayanagar 3rd Block, Bangalore", category: "Management Coaching", pitch: "Automated Mock Test App & Lead Bot" },
  { company: "Career Launcher Indiranagar", fullName: "Admissions Head", phone: "+917899723611", location: "CMH Road, Indiranagar, Bangalore", category: "Exam Prep", pitch: "WhatsApp Course Catalog & Counselor Bot" },
  { company: "ALLEN Career Institute Jayanagar", fullName: "Center Administrator", phone: "+919513763144", location: "Jayanagar 3rd Block, Bangalore", category: "Medical Prep", pitch: "Student Portal & Fee Reminder Bot" },
  { company: "BASE Educational Services", fullName: "Academic Head", phone: "+918042604600", location: "Basavanagudi, Bangalore", category: "Competitive Exam Prep", pitch: "Mobile Learning Management App" },
  { company: "Deeksha Learning Network", fullName: "Admissions Office", phone: "+919513745678", location: "Kanakapura Road, Bangalore", category: "PUC & IIT Coaching", pitch: "Automated Parent Communication WhatsApp Bot" },

  // --- BANGALORE: Real Estate & Property Consultants ---
  { company: "Agarwal Estates", fullName: "Manoj Agarwal (Founder)", phone: "+918123301122", location: "Marathahalli, Bangalore", category: "Real Estate Consultancy", pitch: "AI WhatsApp Lead Qualification Bot & Property Portal" },
  { company: "Address Advisors Property Desk", fullName: "Managing Partner", phone: "+918792926457", location: "Jayanagar, Bangalore", category: "Commercial Advisory", pitch: "Buyer Screening Bot & Site Visit Booking Engine" },
  { company: "100 Yards Property Consultants", fullName: "Principal Broker", phone: "+919916866667", location: "Kalyan Nagar, Bangalore", category: "Real Estate Brokerage", pitch: "Web Property Showcase & Automated Inquiry Bot" },
  { company: "Prop Road Consultants", fullName: "Managing Director", phone: "+919019849801", location: "Bangalore", category: "Property Advisory", pitch: "Lead Capture CRM & WhatsApp Automation" },
  { company: "Silverline Realty", fullName: "Farook Mahmood (CMD)", phone: "+919845011222", location: "MG Road, Bangalore", category: "Luxury Real Estate", pitch: "High-Net-Worth Buyer Web Showcase & Bot" },
  { company: "Hanuman Estate Agency", fullName: "Lead Property Advisor", phone: "+919844055667", location: "Indiranagar, Bangalore", category: "Property Consultants", pitch: "Rental Inventory Web Management System" },
  { company: "Brigade Realty Advisory", fullName: "Senior Broker Partner", phone: "+919900887766", location: "Whitefield, Bangalore", category: "Residential Realty", pitch: "3D Floorplan Web Engine & Lead Bot" },
  { company: "Prime Properties Bangalore", fullName: "Director", phone: "+919845123478", location: "HSR Layout, Bangalore", category: "Property Advisory", pitch: "Site Visit Scheduler & WhatsApp Bot" },

  // --- BANGALORE: Packers & Movers / Logistics ---
  { company: "Mantra Cargo Packers & Movers", fullName: "Operations Head", phone: "+919572515050", location: "Koramangala / HSR, Bangalore", category: "Packers & Movers", pitch: "Instant WhatsApp Quotation Bot & Web Engine" },
  { company: "Professional Movers & Packers", fullName: "Branch Head", phone: "+919351166155", location: "Whitefield, Bangalore", category: "Relocation Services", pitch: "Consignment Tracking Mobile App" },
  { company: "Allwins Packers and Cargo Movers", fullName: "Managing Director", phone: "+919591117117", location: "Marathahalli, Bangalore", category: "Cargo & Moving", pitch: "WhatsApp Instant Moving Cost Estimator" },
  { company: "Speed Packers and Movers", fullName: "Dispatch Manager", phone: "+919379993666", location: "HSR Layout, Bangalore", category: "Packers & Movers", pitch: "Driver Route & Booking Web Engine" },
  { company: "SP Packers and Movers", fullName: "Operations Manager", phone: "+917877017759", location: "Indiranagar, Bangalore", category: "Packers & Movers", pitch: "Automated WhatsApp Moving Quote Bot" },
  { company: "Punia Packers and Movers", fullName: "Branch Manager", phone: "+919632683005", location: "Koramangala, Bangalore", category: "Relocation", pitch: "Customer Tracking & Quote Portal" },

  // --- HYDERABAD: Healthcare, Clinics & Hospitals ---
  { company: "Jade Clinics Hyderabad", fullName: "Medical Administrator", phone: "+919505900500", location: "Banjara Hills, Hyderabad", category: "Multi-Speciality Clinic", pitch: "Automated Patient Appointment Scheduler & CRM" },
  { company: "PET FIRST 24/7 Hospital", fullName: "Hospital Superintendent", phone: "+919577791111", location: "Jubilee Hills, Hyderabad", category: "Speciality Hospital", pitch: "24/7 Emergency Care Booking Bot & Web Portal" },
  { company: "Hyderabad Furcare Clinic", fullName: "Senior Consultant", phone: "+916361454365", location: "Madhapur, Hyderabad", category: "Healthcare Clinic", pitch: "WhatsApp Patient Booking Bot" },
  { company: "Hyderabad Pet Medical & Clinic", fullName: "Clinic In-Charge", phone: "+919666138276", location: "Gachibowli, Hyderabad", category: "Medical Center", pitch: "Automated Consultation Scheduler" },
  { company: "Hyderabad Pets Clinic", fullName: "Practice Head", phone: "+919493723580", location: "Kondapur, Hyderabad", category: "Medical Practice", pitch: "Patient Records Portal & Reminder Bot" },
  { company: "Balapur Super Speciality Dental", fullName: "Chief Dental Surgeon", phone: "+919398743900", location: "Balapur, Hyderabad", category: "Dental Hospital", pitch: "OPD Booking App & Treatment Recall Bot" },
  { company: "Dr. Gowd's Dental Hospital", fullName: "Dr. M. S. Gowd", phone: "+918886664555", location: "Banjara Hills, Hyderabad", category: "Super Speciality Dental", pitch: "VIP Patient Concierge Mobile Portal" },
  { company: "FMS Dental Hospital Jubilee Hills", fullName: "Clinical Director", phone: "+918885060770", location: "Jubilee Hills, Hyderabad", category: "Dental Hospital", pitch: "International Patient Booking Web Engine" },
  { company: "Anu My Baby Hospital", fullName: "Hospital Admin", phone: "+919100994455", location: "Somajiguda, Hyderabad", category: "Pediatric Hospital", pitch: "Vaccination Reminder WhatsApp Bot" },
  { company: "Care Dental Clinic Gachibowli", fullName: "Senior Consultant", phone: "+919949012345", location: "Gachibowli, Hyderabad", category: "Dental Practice", pitch: "Automated Appointment Confirmation System" },

  // --- HYDERABAD: Aesthetic, Skin & Hair Clinics ---
  { company: "Oliva Skin & Hair Clinic Banjara Hills", fullName: "Clinic Manager", phone: "+919100012345", location: "Banjara Hills, Hyderabad", category: "Aesthetic Clinic", pitch: "Laser Session Booking & Customer App" },
  { company: "Labelle Slimming & Skin Clinic", fullName: "Branch Head", phone: "+919848011223", location: "Jubilee Hills, Hyderabad", category: "Aesthetic & Slimming", pitch: "Package Booking Bot & Treatment Tracker" },
  { company: "Dr. Anji Skin & Hair Clinic", fullName: "Dr. Anjaneyulu", phone: "+919885012345", location: "Kukatpally, Hyderabad", category: "Dermatology Clinic", pitch: "Patient Consultation Scheduler" },
  { company: "Vplant Advanced Hair Clinic", fullName: "Senior Surgeon", phone: "+919100123456", location: "Madhapur, Hyderabad", category: "Hair Restoration", pitch: "Pre-Consultation Assessment Web Bot" },
  { company: "Kolors Healthcare Gachibowli", fullName: "Center Head", phone: "+919010112233", location: "Gachibowli, Hyderabad", category: "Wellness & Aesthetics", pitch: "Lead Nurturing WhatsApp Automation" },

  // --- HYDERABAD: Luxury Car Detailing & Auto Studios ---
  { company: "The Detailing Mafia Jubilee Hills", fullName: "Studio Managing Partner", phone: "+919000123456", location: "Jubilee Hills, Hyderabad", category: "Car Detailing", pitch: "Ceramic Warranty Digital Portal & Booking App" },
  { company: "Express Car Detailing Gachibowli", fullName: "Studio Owner", phone: "+919849012345", location: "Gachibowli, Hyderabad", category: "Auto Studio", pitch: "Doorstep Booking App & Reminder Bot" },
  { company: "Ceramic Pro Hyderabad", fullName: "Franchise Director", phone: "+919885566778", location: "Banjara Hills, Hyderabad", category: "Luxury Coating", pitch: "VIP Client Mobile App & Warranty Tracking" },
  { company: "Autofin Detailing Studio", fullName: "Operations Head", phone: "+919989012345", location: "Begumpet, Hyderabad", category: "Car Detailing", pitch: "Slot Booking System & Customer Portal" },
  { company: "Speed Car Wash & Detailing", fullName: "Managing Partner", phone: "+919000556677", location: "Madhapur, Hyderabad", category: "Car Care", pitch: "Automated Wash Slot Booking Bot" },

  // --- HYDERABAD: Real Estate Consultancies & Realtors ---
  { company: "Urban Living Real Estate", fullName: "Managing Partner", phone: "+919849023456", location: "Hitec City, Hyderabad", category: "Real Estate Advisory", pitch: "AI WhatsApp Buyer Qualification Bot" },
  { company: "Space Real Estate Consultants", fullName: "Principal Broker", phone: "+919000223344", location: "Banjara Hills, Hyderabad", category: "Luxury Real Estate", pitch: "High-Ticket Property Showcase Portal" },
  { company: "Gachibowli Properties Advisory", fullName: "Lead Consultant", phone: "+919885112233", location: "Gachibowli, Hyderabad", category: "Commercial Realty", pitch: "Site Visit Scheduler & Lead CRM" },
  { company: "Fortune Realty Consultants", fullName: "Director", phone: "+919848123456", location: "Kondapur, Hyderabad", category: "Real Estate Brokerage", pitch: "Automated WhatsApp Inventory Matcher" },
  { company: "Prime Acres Realty Desk", fullName: "Broker Head", phone: "+919700112233", location: "Kokapet, Hyderabad", category: "Plotting & Villas", pitch: "3D Virtual Tour Web Portal & Lead Bot" },

  // --- HYDERABAD: Packers & Movers / Relocation ---
  { company: "Deccan Express Packers and Movers", fullName: "Operations Manager", phone: "+919849556677", location: "Secunderabad, Hyderabad", category: "Packers & Movers", pitch: "Instant WhatsApp Quotation Bot" },
  { company: "Royal Packers & Movers Hyderabad", fullName: "Branch Head", phone: "+919000889900", location: "Kukatpally, Hyderabad", category: "Moving & Storage", pitch: "Live Consignment Tracking App" },
  { company: "City Cargo Movers Hitec", fullName: "Dispatch Head", phone: "+919885778899", location: "Madhapur, Hyderabad", category: "Corporate Logistics", pitch: "Instant Relocation Estimate Calculator" },

  // --- CHENNAI: Healthcare, Clinics & Dental Centers ---
  { company: "Dr. Smilez Dental Center Anna Nagar", fullName: "Chief Orthodontist", phone: "+919840012345", location: "Anna Nagar, Chennai", category: "Dental Center", pitch: "Patient Mobile Portal & Recall Bot" },
  { company: "Vasan Dental Care T Nagar", fullName: "Clinical Superintendent", phone: "+919841023456", location: "T Nagar, Chennai", category: "Multi-Specialty Dental", pitch: "Automated WhatsApp Booking Engine" },
  { company: "The Dentist Multi-Specialty Clinic", fullName: "Dr. Practice Head", phone: "+919940123456", location: "Adyar, Chennai", category: "Dental Clinic", pitch: "Patient Appointment Scheduling App" },
  { company: "Apollo Dental Clinic Alwarpet", fullName: "Practice Manager", phone: "+919840556677", location: "Alwarpet, Chennai", category: "Dental Care", pitch: "Digital Token & Confirmation Bot" },
  { company: "Dr. Jayakumar Skin & Laser Clinic", fullName: "Dr. Jayakumar", phone: "+919841122334", location: "Kilpauk, Chennai", category: "Skin & Laser", pitch: "Laser Session Booking App" },
  { company: "Kosmoderma Clinic Chennai", fullName: "Branch Director", phone: "+919940011223", location: "Cenotaph Road, Chennai", category: "Aesthetic Clinic", pitch: "VIP Client Membership Portal" },
  { company: "Sparkle Dental & Cosmetic Care", fullName: "Managing Dentist", phone: "+919840334455", location: "Velachery, Chennai", category: "Cosmetic Dental", pitch: "WhatsApp Consultation Bot" },

  // --- CHENNAI: Luxury Car Detailing & Auto Studios ---
  { company: "The Detailing Mafia Chennai", fullName: "Studio Managing Partner", phone: "+919840223344", location: "Anna Nagar, Chennai", category: "Ceramic Studio", pitch: "Digital Warranty Card & Booking System" },
  { company: "3M Car Care T Nagar", fullName: "Studio Manager", phone: "+919841334455", location: "T Nagar, Chennai", category: "Auto Studio", pitch: "Service Due Reminder WhatsApp Bot" },
  { company: "Ceramic Pro Chennai", fullName: "Studio Director", phone: "+919940223344", location: "Nungambakkam, Chennai", category: "Luxury Coating", pitch: "VIP Customer Portal & Maintenance App" },
  { company: "Speed Car Spa & Detailing", fullName: "Studio Owner", phone: "+919840445566", location: "Adyar, Chennai", category: "Car Detailing", pitch: "Mobile Slot Booking App" },
  { company: "Torq Auto Care Chennai", fullName: "Operations Partner", phone: "+919841445566", location: "OMR, Chennai", category: "Auto Detailing", pitch: "Customer Job Card & Status App" },

  // --- CHENNAI: Real Estate Consultancies & Relocation ---
  { company: "Chennai Dream Homes Advisory", fullName: "Principal Broker", phone: "+919840667788", location: "Anna Nagar, Chennai", category: "Real Estate Advisory", pitch: "AI WhatsApp Buyer Screening Bot" },
  { company: "Real Value Promoters Desk", fullName: "Sales Director", phone: "+919841556677", location: "T Nagar, Chennai", category: "Property Consultants", pitch: "Property Showcase Web Portal" },
  { company: "OMR Property Consultants", fullName: "Lead Realtor", phone: "+919940334455", location: "Perungudi, OMR, Chennai", category: "Commercial Realty", pitch: "Lead CRM & WhatsApp Scheduler" },
  { company: "Chennai Express Movers & Cargo", fullName: "Operations Head", phone: "+919840778899", location: "Guindy, Chennai", category: "Packers & Movers", pitch: "Instant Moving Quote Bot" },
  { company: "Transworld Packers Chennai", fullName: "Branch Manager", phone: "+919841667788", location: "Ambattur, Chennai", category: "Relocation Services", pitch: "Consignment Tracking Mobile App" },

  // --- KOCHI (ERNAKULAM): Healthcare, Detailing & Hospitality ---
  { company: "Cochin Dental Clinic & Implant Center", fullName: "Chief Surgeon", phone: "+919846012345", location: "Panampilly Nagar, Kochi", category: "Dental Implants", pitch: "Dental Tourism Web Portal & WhatsApp Bot" },
  { company: "Lakeshore Multi-Specialty Dental", fullName: "Clinical Head", phone: "+919847012345", location: "Nettoor, Kochi", category: "Dental Hospital", pitch: "Online Consultation & Booking App" },
  { company: "Dr. Biju Cosmetic Dermatology", fullName: "Dr. Biju", phone: "+919447012345", location: "Kaloor, Kochi", category: "Skin Clinic", pitch: "Appointment Confirmation WhatsApp Bot" },
  { company: "The Detailing Mafia Kochi", fullName: "Studio Owner", phone: "+919846123456", location: "Edappally, Kochi", category: "Ceramic Studio", pitch: "Warranty Portal & Customer App" },
  { company: "Esperto Car Care Cochin", fullName: "Managing Partner", phone: "+919847123456", location: "Kadavanthra, Kochi", category: "Car Detailing", pitch: "Customer Slot Booking App" },
  { company: "Kerala Luxury Realty Advisory", fullName: "Managing Director", phone: "+919447123456", location: "Marine Drive, Kochi", category: "Waterfront Realty", pitch: "Luxury Villa Web Showcase & Bot" },
  { company: "Kochi Movers & Logistics Desk", fullName: "Operations Head", phone: "+919846234567", location: "Vyttila, Kochi", category: "Packers & Movers", pitch: "Instant Moving Quote Calculator" },

  // --- COIMBATORE: Clinics, Detailing & Academies ---
  { company: "Coimbatore Dental Hospital", fullName: "Medical Superintendent", phone: "+919842212345", location: "RS Puram, Coimbatore", category: "Dental Hospital", pitch: "OPD Booking Portal & Patient App" },
  { company: "Ganga Dental & Maxillofacial", fullName: "Chief Dental Head", phone: "+919843012345", location: "Ram Nagar, Coimbatore", category: "Speciality Dental", pitch: "Treatment Protocol & Recall Bot" },
  { company: "Kovai Skin & Hair Care", fullName: "Lead Dermatologist", phone: "+919442012345", location: "Saibaba Colony, Coimbatore", category: "Skin Clinic", pitch: "Session Scheduling WhatsApp Bot" },
  { company: "The Detailing Mafia Coimbatore", fullName: "Studio Partner", phone: "+919842012345", location: "Avinashi Road, Coimbatore", category: "Car Detailing", pitch: "Ceramic Warranty Digital Portal" },
  { company: "Coimbatore Auto Spa Studio", fullName: "Studio Owner", phone: "+919843112233", location: "Peelamedu, Coimbatore", category: "Auto Studio", pitch: "Customer Booking Mobile App" },
  { company: "Kovai Property Consultants", fullName: "Principal Broker", phone: "+919443011223", location: "Gandhipuram, Coimbatore", category: "Property Advisory", pitch: "WhatsApp Lead Qualification Bot" },
  { company: "Kongu Packers and Movers", fullName: "Branch Head", phone: "+919842112233", location: "Singanallur, Coimbatore", category: "Packers & Movers", pitch: "Instant Quotation Bot" },

  // --- MYSORE: Heritage Clinics, Detailing & Realty ---
  { company: "Mysore Dental Speciality Center", fullName: "Practice Head", phone: "+919845023456", location: "Gokulam, Mysore", category: "Dental Center", pitch: "Patient Appointment App & Recall Bot" },
  { company: "Gokulam Skin & Aesthetic Clinic", fullName: "Senior Dermatologist", phone: "+919845123456", location: "Gokulam 3rd Stage, Mysore", category: "Aesthetic Clinic", pitch: "WhatsApp Consultation Bot" },
  { company: "Mysore Car Care Studio", fullName: "Studio Partner", phone: "+919845223344", location: "Vijayanagar, Mysore", category: "Car Detailing", pitch: "Service Slot Booking App" },
  { company: "Heritage City Properties Mysore", fullName: "Lead Realtor", phone: "+919845334455", location: "Jayalakshmipuram, Mysore", category: "Real Estate Advisory", pitch: "Villa Showcase Web Portal & Lead Bot" },
  { company: "Chamundi Packers & Logistics", fullName: "Operations Manager", phone: "+919845445566", location: "Hebbal, Mysore", category: "Packers & Movers", pitch: "Instant WhatsApp Moving Estimator" }
];

console.log(`Prepared ${southLeads.length} curated South India commercial business leads.`);

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const leadsCol = mongoose.connection.db.collection("leads");
  const agentsCol = mongoose.connection.db.collection("agents");
  const activitiesCol = mongoose.connection.db.collection("activities");

  let insertedCount = 0;
  let skippedCount = 0;

  for (const item of southLeads) {
    const existing = await leadsCol.findOne({ agentId: southAgentId, phone: item.phone });
    if (existing) {
      skippedCount++;
      continue;
    }

    const doc = {
      agentId: southAgentId,
      company: item.company,
      fullName: item.fullName,
      firstName: item.fullName.split(" ")[0] || item.company.split(" ")[0],
      lastName: item.fullName.split(" ").slice(1).join(" ") || "—",
      jobTitle: item.category,
      email: "",
      phone: item.phone,
      source: "Google Maps",
      channels: ["whatsapp", "call"],
      status: "new",
      pipelineStage: "new",
      agentEnabled: true,
      outreachStatus: "none",
      outreachAttempts: 0,
      deletedAt: null,
      website: "",
      location: item.location,
      notes: [
        {
          _id: new mongoose.Types.ObjectId(),
          text: `Targeted South India Lead: ${item.pitch}. Located in ${item.location}.`,
          author: "South India Lead Engine",
          createdAt: new Date()
        }
      ],
      history: [
        {
          field: "status",
          from: "",
          to: "new",
          by: "System",
          at: new Date(),
          _id: new mongoose.Types.ObjectId()
        }
      ],
      tags: ["South-India", item.category, item.location.split(",")[1]?.trim() || "South India"],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const res = await leadsCol.insertOne(doc);
    insertedCount++;

    await activitiesCol.insertOne({
      agentId: southAgentId,
      leadId: res.insertedId,
      type: "lead_created",
      title: `Imported: ${item.company}`,
      description: `Targeting ${item.location} with offer: ${item.pitch}`,
      createdAt: new Date()
    });
  }

  const totalInWorkspace = await leadsCol.countDocuments({ agentId: southAgentId });
  await agentsCol.updateOne({ _id: southAgentId }, { $set: { leadCount: totalInWorkspace } });

  console.log("="*60);
  console.log(`SUCCESSFULLY POPULATED SOUTH INDIA WORKSPACE!`);
  console.log(`Inserted: ${insertedCount} new leads`);
  console.log(`Skipped (already exists): ${skippedCount}`);
  console.log(`Total Leads in "South India Enterprise" Workspace: ${totalInWorkspace}`);
  console.log("="*60);

  mongoose.connection.close();
});
