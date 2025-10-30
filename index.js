require("dotenv").config();
const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Email transporter configuration
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
    }
});

// Email template for prescription notification
const getPrescriptionEmailTemplate = (prescription) => {
    return `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #435ba1; color: white; padding: 20px; text-align: center; }
        .content { background-color: #f9f9f9; padding: 20px; margin-top: 20px; }
        .prescription-info { background-color: white; padding: 15px; margin: 10px 0; border-left: 4px solid #435ba1; }
        .medication { background-color: #e8f4f8; padding: 10px; margin: 5px 0; border-radius: 5px; }
        .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
        .button { display: inline-block; padding: 10px 20px; background-color: #435ba1; color: white; text-decoration: none; border-radius: 5px; margin: 10px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>New Prescription Issued</h1>
            <p>Prescription #: ${prescription.prescriptionNumber}</p>
        </div>
        
        <div class="content">
            <h2>Dear ${prescription.patientName},</h2>
            <p>A new prescription has been issued for you by <strong>${prescription.doctorName}</strong> (${prescription.doctorSpecialization}).</p>
            
            <div class="prescription-info">
                <h3>Prescription Details</h3>
                <p><strong>Date Issued:</strong> ${new Date(prescription.createdAt).toLocaleDateString()}</p>
                <p><strong>Valid Until:</strong> ${new Date(prescription.expiresAt).toLocaleDateString()}</p>
                <p><strong>Diagnosis:</strong> ${prescription.diagnosis}</p>
            </div>
            
            <div class="prescription-info">
                <h3>Prescribed Medications</h3>
                ${prescription.medications.map((med, index) => `
                    <div class="medication">
                        <strong>${index + 1}. ${med.name}</strong><br>
                        Dosage: ${med.dosage}<br>
                        Frequency: ${med.frequency}<br>
                        ${med.duration ? `Duration: ${med.duration}<br>` : ''}
                        ${med.instructions ? `Instructions: ${med.instructions}` : ''}
                    </div>
                `).join('')}
            </div>
            
            ${prescription.labTests && prescription.labTests.length > 0 ? `
                <div class="prescription-info">
                    <h3>Recommended Lab Tests</h3>
                    <ul>
                        ${prescription.labTests.map(test => `<li>${test}</li>`).join('')}
                    </ul>
                </div>
            ` : ''}
            
            ${prescription.followUpDate ? `
                <div class="prescription-info">
                    <h3>Follow-up Appointment</h3>
                    <p>${new Date(prescription.followUpDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                </div>
            ` : ''}
            
            ${prescription.notes ? `
                <div class="prescription-info">
                    <h3>Additional Notes</h3>
                    <p>${prescription.notes}</p>
                </div>
            ` : ''}
            
            <p style="text-align: center;">
                <a href="${process.env.FRONTEND_URL}/dashboard/my-prescriptions" class="button">View Prescription Online</a>
            </p>
        </div>
        
        <div class="footer">
            <p>This is an automated email. Please do not reply to this message.</p>
            <p>For any queries, please contact your doctor or visit our website.</p>
            <p>&copy; ${new Date().getFullYear()} Health Cave. All rights reserved.</p>
        </div>
    </div>
</body>
</html>
    `;
};

// Function to send prescription email
const sendPrescriptionEmail = async (prescription) => {
    try {
        const mailOptions = {
            from: `"Health Cave" <${process.env.EMAIL_USER}>`,
            to: prescription.patientId,
            subject: `New Prescription Issued - ${prescription.prescriptionNumber}`,
            html: getPrescriptionEmailTemplate(prescription)
        };

        const info = await transporter.sendMail(mailOptions);
        console.log('Prescription email sent:', info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('Error sending prescription email:', error);
        return { success: false, error: error.message };
    }
};

const uri = `${process.env.MONGODB_URI}`;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        await client.connect();
        console.log("Connected to MongoDB");

        const doctorsCollection = client.db("healthCave").collection("doctors");

        app.get("/doctors", async (req, res) => {
            const result = await doctorsCollection.find().toArray();
            res.send(result);
        });


        app.get("/doctors/:id", async (req, res) => {
            const { id } = req.params;
            try {
                const doctor = await doctorsCollection.findOne({ _id: new ObjectId(id) });
                if (!doctor) return res.status(404).send({ error: "Doctor not found" });
                res.send(doctor);
            } catch (err) {
                console.error(err);
                res.status(500).send({ error: "Failed to fetch doctor" });
            }
        });

        // PUT update doctor information
        app.put("/doctors/:id", async (req, res) => {
            try {
                const { id } = req.params;
                const updateData = req.body;

                // Remove _id from update data if present
                delete updateData._id;

                // Add updatedAt timestamp
                updateData.updatedAt = new Date();

                const result = await doctorsCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: updateData }
                );

                if (result.matchedCount === 0) {
                    return res.status(404).send({ error: "Doctor not found" });
                }

                res.send({ message: "Doctor updated successfully" });
            } catch (err) {
                console.error(err);
                res.status(500).send({ error: "Failed to update doctor" });
            }
        });


        /* ====================Api For Doctor Apply=================== */
        const doctorsApplyCollection = client.db("healthCave").collection("doctorApply");

        // POST doctor application
        app.post("/doctorApply", async (req, res) => {
            try {
                const application = req.body;

                // ensure default role
                if (!application.role) {
                    application.role = "user";
                }

                const result = await doctorsApplyCollection.insertOne(application);
                res.status(201).send(result);
            } catch (err) {
                console.error(err);
                res.status(500).send({ error: "Failed to submit application" });
            }
        });

        // GET all doctor applications
        app.get("/doctorApply", async (req, res) => {
            try {
                const result = await doctorsApplyCollection.find().toArray();
                res.send(result);
            } catch (err) {
                console.error(err);
                res.status(500).send({ error: "Failed to fetch applications" });
            }
        });


        // POST approve application (move to doctors collection)
        app.post("/makeDoctor", async (req, res) => {
            try {
                const doctorData = req.body;
                const id = doctorData._id;
                delete doctorData._id; // remove old ID so Mongo generates new one

                // Add default fields for new doctors
                doctorData.consultationFee = doctorData.consultationFee || 100;
                doctorData.availability = doctorData.availability || "Available";
                doctorData.nextAvailable = doctorData.nextAvailable || "Today";
                doctorData.patients = doctorData.patients || 0;
                doctorData.createdAt = new Date();

                // Insert into doctors collection
                const result = await doctorsCollection.insertOne(doctorData);

                // Remove from doctorApply collection
                await doctorsApplyCollection.deleteOne({ _id: new ObjectId(id) });

                res.status(201).send(result);
            } catch (err) {
                console.error(err);
                res.status(500).send({ error: "Failed to approve doctor" });
            }
        });

        // POST initialize missing doctor fields (one-time setup)
        app.post("/doctors/initialize-fields", async (req, res) => {
            try {
                // Get all doctors
                const doctors = await doctorsCollection.find({}).toArray();
                let modifiedCount = 0;

                for (const doctor of doctors) {
                    const updateFields = {};
                    let needsUpdate = false;

                    // Add missing fields with default values
                    if (!doctor.consultationFee) {
                        updateFields.consultationFee = 100;
                        needsUpdate = true;
                    }
                    if (!doctor.availability) {
                        updateFields.availability = "Available";
                        needsUpdate = true;
                    }
                    if (!doctor.nextAvailable) {
                        updateFields.nextAvailable = "Today";
                        needsUpdate = true;
                    }
                    if (doctor.patients === undefined || doctor.patients === null) {
                        updateFields.patients = 0;
                        needsUpdate = true;
                    }

                    if (needsUpdate) {
                        updateFields.updatedAt = new Date();
                        await doctorsCollection.updateOne(
                            { _id: doctor._id },
                            { $set: updateFields }
                        );
                        modifiedCount++;
                    }
                }

                res.send({
                    message: "Doctor fields initialized successfully",
                    modifiedCount: modifiedCount
                });
            } catch (err) {
                console.error(err);
                res.status(500).send({ error: "Failed to initialize doctor fields" });
            }
        });

        // POST seed sample doctors (for development/testing)
        app.post("/doctors/seed", async (req, res) => {
            try {
                const sampleDoctors = [
                    {
                        name: "Sarah Johnson",
                        specialization: "Cardiology",
                        hospital: "City General Hospital",
                        image: "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=400&h=400&fit=crop&crop=face",
                        rating: 4.8,
                        consultationFee: 150,
                        availability: "Available",
                        nextAvailable: "Today",
                        patients: 1250,
                        createdAt: new Date()
                    },
                    {
                        name: "Michael Chen",
                        specialization: "Neurology",
                        hospital: "Metropolitan Medical Center",
                        image: "https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=400&h=400&fit=crop&crop=face",
                        rating: 4.9,
                        consultationFee: 180,
                        availability: "Available",
                        nextAvailable: "Tomorrow",
                        patients: 980,
                        createdAt: new Date()
                    },
                    {
                        name: "Emily Rodriguez",
                        specialization: "Pediatrics",
                        hospital: "Children's Healthcare Center",
                        image: "https://images.unsplash.com/photo-1594824475317-8b7b0c8b8b8b?w=400&h=400&fit=crop&crop=face",
                        rating: 4.7,
                        consultationFee: 120,
                        availability: "Busy",
                        nextAvailable: "Next Week",
                        patients: 2100,
                        createdAt: new Date()
                    },
                    {
                        name: "David Thompson",
                        specialization: "Orthopedics",
                        hospital: "Sports Medicine Institute",
                        image: "https://images.unsplash.com/photo-1582750433449-648ed127bb54?w=400&h=400&fit=crop&crop=face",
                        rating: 4.6,
                        consultationFee: 160,
                        availability: "Available",
                        nextAvailable: "Today",
                        patients: 750,
                        createdAt: new Date()
                    },
                    {
                        name: "Lisa Wang",
                        specialization: "Dermatology",
                        hospital: "Skin Care Specialists",
                        image: "https://images.unsplash.com/photo-1594824475317-8b7b0c8b8b8b?w=400&h=400&fit=crop&crop=face",
                        rating: 4.9,
                        consultationFee: 140,
                        availability: "Available",
                        nextAvailable: "Tomorrow",
                        patients: 1800,
                        createdAt: new Date()
                    }
                ];

                // Check if doctors already exist to avoid duplicates
                const existingCount = await doctorsCollection.countDocuments();

                if (existingCount === 0) {
                    const result = await doctorsCollection.insertMany(sampleDoctors);
                    res.send({
                        message: "Sample doctors seeded successfully",
                        insertedCount: result.insertedCount
                    });
                } else {
                    res.send({
                        message: "Doctors already exist in database",
                        existingCount: existingCount
                    });
                }
            } catch (err) {
                console.error(err);
                res.status(500).send({ error: "Failed to seed doctors" });
            }
        });

        // DELETE cancel application
        app.delete("/doctorApply/:id", async (req, res) => {
            try {
                const { id } = req.params;
                const result = await doctorsApplyCollection.deleteOne({
                    _id: new ObjectId(id),
                });
                res.send(result);
            } catch (err) {
                console.error(err);
                res.status(500).send({ error: "Failed to delete application" });
            }
        });

        /* ================Doctor List On dashboard========================= */

        // DELETE doctor by ID
        app.delete("/doctors/:id", async (req, res) => {
            try {
                const { id } = req.params;
                const result = await doctorsCollection.deleteOne({ _id: new ObjectId(id) });
                res.send(result);
            } catch (err) {
                console.error(err);
                res.status(500).send({ error: "Failed to delete doctor" });
            }
        });

        /* ================Doctor Availability Management================== */

        // PUT update doctor availability
        app.put("/doctors/:id/availability", async (req, res) => {
            try {
                const { id } = req.params;
                const { availability } = req.body;

                if (!availability || !Array.isArray(availability)) {
                    return res.status(400).send({ error: "Invalid availability data" });
                }

                const result = await doctorsCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: { availability: availability } }
                );

                if (result.matchedCount === 0) {
                    return res.status(404).send({ error: "Doctor not found" });
                }

                res.send({ message: "Availability updated successfully" });
            } catch (err) {
                console.error(err);
                res.status(500).send({ error: "Failed to update availability" });
            }
        });

        // GET doctor availability
        app.get("/doctors/:id/availability", async (req, res) => {
            try {
                const { id } = req.params;
                const doctor = await doctorsCollection.findOne(
                    { _id: new ObjectId(id) },
                    { projection: { availability: 1 } }
                );

                if (!doctor) {
                    return res.status(404).send({ error: "Doctor not found" });
                }

                res.send({ availability: doctor.availability || [] });
            } catch (err) {
                console.error(err);
                res.status(500).send({ error: "Failed to fetch availability" });
            }
        });

        /* ================Appointment Management================== */
        const appointmentsCollection = client.db("healthCave").collection("appointments");

        // POST create appointment
        app.post("/appointments", async (req, res) => {
            try {
                const appointmentData = req.body;

                // Add default fields
                appointmentData.createdAt = new Date();
                appointmentData.status = appointmentData.status || "pending";
                appointmentData.paymentStatus = appointmentData.paymentStatus || "pending";

                const result = await appointmentsCollection.insertOne(appointmentData);

                // Update doctor's patient count when appointment is confirmed/completed
                if (appointmentData.doctorId && (appointmentData.status === "confirmed" || appointmentData.status === "completed")) {
                    try {
                        await doctorsCollection.updateOne(
                            { _id: new ObjectId(appointmentData.doctorId) },
                            { $inc: { patients: 1 } }
                        );
                    } catch (updateErr) {
                        console.log("Failed to update doctor patient count:", updateErr);
                    }
                }

                res.status(201).send(result);
            } catch (err) {
                console.error(err);
                res.status(500).send({ error: "Failed to create appointment" });
            }
        });

        // GET all appointments
        app.get("/appointments", async (req, res) => {
            try {
                const result = await appointmentsCollection.find().toArray();
                res.send(result);
            } catch (err) {
                console.error(err);
                res.status(500).send({ error: "Failed to fetch appointments" });
            }
        });

        // GET appointments by user ID
        app.get("/appointments/user/:userId", async (req, res) => {
            try {
                const { userId } = req.params;
                const result = await appointmentsCollection.find({ userId: userId }).toArray();
                res.send(result);
            } catch (err) {
                console.error(err);
                res.status(500).send({ error: "Failed to fetch user appointments" });
            }
        });

        // GET appointments by doctor ID
        app.get("/appointments/doctor/:doctorId", async (req, res) => {
            try {
                const { doctorId } = req.params;
                const result = await appointmentsCollection.find({ doctorId: doctorId }).toArray();
                res.send(result);
            } catch (err) {
                console.error(err);
                res.status(500).send({ error: "Failed to fetch doctor appointments" });
            }
        });

        // PUT update appointment status
        app.put("/appointments/:id/status", async (req, res) => {
            try {
                const { id } = req.params;
                const { status } = req.body;

                if (!["pending", "confirmed", "cancelled", "completed"].includes(status)) {
                    return res.status(400).send({ error: "Invalid status" });
                }

                // Get the appointment to check previous status
                const appointment = await appointmentsCollection.findOne({ _id: new ObjectId(id) });
                if (!appointment) {
                    return res.status(404).send({ error: "Appointment not found" });
                }

                const result = await appointmentsCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: { status: status, updatedAt: new Date() } }
                );

                // Update doctor's patient count when appointment is completed for the first time
                if (appointment.doctorId && status === "completed" && appointment.status !== "completed") {
                    try {
                        await doctorsCollection.updateOne(
                            { _id: new ObjectId(appointment.doctorId) },
                            { $inc: { patients: 1 } }
                        );
                    } catch (updateErr) {
                        console.log("Failed to update doctor patient count:", updateErr);
                    }
                }

                res.send({ message: "Appointment status updated successfully" });
            } catch (err) {
                console.error(err);
                res.status(500).send({ error: "Failed to update appointment status" });
            }
        });

        // PUT update payment status
        app.put("/appointments/:id/payment", async (req, res) => {
            try {
                const { id } = req.params;
                const { paymentStatus, paymentId, amount } = req.body;

                console.log(`Updating payment status for appointment ${id}:`, { paymentStatus, paymentId, amount });

                if (!["pending", "paid", "failed", "refunded"].includes(paymentStatus)) {
                    return res.status(400).send({ error: "Invalid payment status" });
                }

                const updateData = {
                    paymentStatus: paymentStatus,
                    updatedAt: new Date()
                };

                if (paymentId) updateData.paymentId = paymentId;
                if (amount) updateData.amount = amount;

                // If payment is successful, also update appointment status to confirmed
                if (paymentStatus === 'paid') {
                    updateData.status = 'confirmed';
                }

                const result = await appointmentsCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: updateData }
                );

                if (result.matchedCount === 0) {
                    console.log(`Appointment ${id} not found`);
                    return res.status(404).send({ error: "Appointment not found" });
                }

                console.log(`Payment status updated successfully for appointment ${id}`);
                res.send({
                    message: "Payment status updated successfully",
                    updated: result.modifiedCount > 0
                });
            } catch (err) {
                console.error("Error updating payment status:", err);
                res.status(500).send({ error: "Failed to update payment status" });
            }
        });

        // DELETE appointment
        app.delete("/appointments/:id", async (req, res) => {
            try {
                const { id } = req.params;
                const result = await appointmentsCollection.deleteOne({ _id: new ObjectId(id) });

                if (result.deletedCount === 0) {
                    return res.status(404).send({ error: "Appointment not found" });
                }

                res.send({ message: "Appointment deleted successfully" });
            } catch (err) {
                console.error(err);
                res.status(500).send({ error: "Failed to delete appointment" });
            }
        });

        // GET appointment by ID
        app.get("/appointments/:id", async (req, res) => {
            try {
                const { id } = req.params;
                const appointment = await appointmentsCollection.findOne({ _id: new ObjectId(id) });

                if (!appointment) {
                    return res.status(404).send({ error: "Appointment not found" });
                }

                res.send(appointment);
            } catch (err) {
                console.error(err);
                res.status(500).send({ error: "Failed to fetch appointment" });
            }
        });

        /* ================Prescription Management================== */
        const prescriptionsCollection = client.db("healthCave").collection("prescriptions");

        // Helper function to generate prescription number
        const generatePrescriptionNumber = async () => {
            const year = new Date().getFullYear();
            const count = await prescriptionsCollection.countDocuments();
            const number = String(count + 1).padStart(6, '0');
            return `RX-${year}-${number}`;
        };

        // POST create prescription
        app.post("/prescriptions", async (req, res) => {
            try {
                const prescriptionData = req.body;

                // BUSINESS LOGIC: Validate appointment exists and is paid
                if (prescriptionData.appointmentId) {
                    const appointment = await appointmentsCollection.findOne({ 
                        _id: new ObjectId(prescriptionData.appointmentId) 
                    });

                    if (!appointment) {
                        return res.status(404).send({ error: "Appointment not found" });
                    }

                    // Check if appointment is paid
                    if (appointment.paymentStatus !== 'paid') {
                        return res.status(403).send({ 
                            error: "Cannot create prescription. Appointment payment not completed." 
                        });
                    }

                    // Check if appointment belongs to this doctor
                    if (appointment.doctorId !== prescriptionData.doctorId) {
                        return res.status(403).send({ 
                            error: "Unauthorized. This appointment is not assigned to you." 
                        });
                    }

                    // Auto-fill patient info from appointment
                    prescriptionData.patientId = appointment.userId || appointment.patientEmail;
                    prescriptionData.patientName = appointment.patientName || prescriptionData.patientName;
                }

                // Generate unique prescription number
                prescriptionData.prescriptionNumber = await generatePrescriptionNumber();

                // Add default fields
                prescriptionData.createdAt = new Date();
                prescriptionData.updatedAt = new Date();
                prescriptionData.status = prescriptionData.status || "active";
                
                // Set expiration date (90 days from creation)
                const expiresAt = new Date();
                expiresAt.setDate(expiresAt.getDate() + 90);
                prescriptionData.expiresAt = expiresAt;

                prescriptionData.verified = true;

                // Hide sensitive doctor contact info (prevent outside deals)
                prescriptionData.doctorContactHidden = true;

                const result = await prescriptionsCollection.insertOne(prescriptionData);
                
                // Update appointment status to include prescription
                if (prescriptionData.appointmentId) {
                    await appointmentsCollection.updateOne(
                        { _id: new ObjectId(prescriptionData.appointmentId) },
                        { 
                            $set: { 
                                prescriptionId: result.insertedId,
                                prescriptionIssued: true,
                                updatedAt: new Date()
                            } 
                        }
                    );
                }
                
                // Get the created prescription with its ID
                const createdPrescription = await prescriptionsCollection.findOne({ 
                    _id: result.insertedId 
                });

                // Send email notification to patient (async, don't wait)
                if (prescriptionData.patientId && prescriptionData.patientId.includes('@')) {
                    sendPrescriptionEmail(createdPrescription).catch(err => {
                        console.error('Failed to send prescription email:', err);
                    });
                }

                res.status(201).send(result);
            } catch (err) {
                console.error(err);
                res.status(500).send({ error: "Failed to create prescription" });
            }
        });

        // GET paid appointments for doctor (for prescription creation)
        app.get("/appointments/doctor/:doctorId/paid", async (req, res) => {
            try {
                const { doctorId } = req.params;
                const result = await appointmentsCollection
                    .find({ 
                        doctorId: doctorId,
                        paymentStatus: 'paid',
                        prescriptionIssued: { $ne: true }  // Not yet prescribed
                    })
                    .sort({ createdAt: -1 })
                    .toArray();
                res.send(result);
            } catch (err) {
                console.error(err);
                res.status(500).send({ error: "Failed to fetch paid appointments" });
            }
        });

        // GET all prescriptions (admin only)
        app.get("/prescriptions", async (req, res) => {
            try {
                const result = await prescriptionsCollection.find().sort({ createdAt: -1 }).toArray();
                res.send(result);
            } catch (err) {
                console.error(err);
                res.status(500).send({ error: "Failed to fetch prescriptions" });
            }
        });

        // GET prescriptions by doctor ID
        app.get("/prescriptions/doctor/:doctorId", async (req, res) => {
            try {
                const { doctorId } = req.params;
                const result = await prescriptionsCollection
                    .find({ doctorId: doctorId })
                    .sort({ createdAt: -1 })
                    .toArray();
                res.send(result);
            } catch (err) {
                console.error(err);
                res.status(500).send({ error: "Failed to fetch doctor prescriptions" });
            }
        });

        // GET prescriptions by patient ID
        app.get("/prescriptions/patient/:patientId", async (req, res) => {
            try {
                const { patientId } = req.params;
                const result = await prescriptionsCollection
                    .find({ patientId: patientId })
                    .sort({ createdAt: -1 })
                    .toArray();
                res.send(result);
            } catch (err) {
                console.error(err);
                res.status(500).send({ error: "Failed to fetch patient prescriptions" });
            }
        });

        // GET single prescription by ID
        app.get("/prescriptions/:id", async (req, res) => {
            try {
                const { id } = req.params;
                const prescription = await prescriptionsCollection.findOne({ _id: new ObjectId(id) });

                if (!prescription) {
                    return res.status(404).send({ error: "Prescription not found" });
                }

                res.send(prescription);
            } catch (err) {
                console.error(err);
                res.status(500).send({ error: "Failed to fetch prescription" });
            }
        });

        // PUT update prescription
        app.put("/prescriptions/:id", async (req, res) => {
            try {
                const { id } = req.params;
                const updateData = req.body;

                // Remove fields that shouldn't be updated
                delete updateData._id;
                delete updateData.prescriptionNumber;
                delete updateData.createdAt;

                // Update timestamp
                updateData.updatedAt = new Date();

                const result = await prescriptionsCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: updateData }
                );

                if (result.matchedCount === 0) {
                    return res.status(404).send({ error: "Prescription not found" });
                }

                res.send({ message: "Prescription updated successfully" });
            } catch (err) {
                console.error(err);
                res.status(500).send({ error: "Failed to update prescription" });
            }
        });

        // PUT update prescription status
        app.put("/prescriptions/:id/status", async (req, res) => {
            try {
                const { id } = req.params;
                const { status } = req.body;

                if (!["active", "expired", "cancelled"].includes(status)) {
                    return res.status(400).send({ error: "Invalid status" });
                }

                const result = await prescriptionsCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: { status: status, updatedAt: new Date() } }
                );

                if (result.matchedCount === 0) {
                    return res.status(404).send({ error: "Prescription not found" });
                }

                res.send({ message: "Prescription status updated successfully" });
            } catch (err) {
                console.error(err);
                res.status(500).send({ error: "Failed to update prescription status" });
            }
        });

        // DELETE prescription
        app.delete("/prescriptions/:id", async (req, res) => {
            try {
                const { id } = req.params;
                const result = await prescriptionsCollection.deleteOne({ _id: new ObjectId(id) });

                if (result.deletedCount === 0) {
                    return res.status(404).send({ error: "Prescription not found" });
                }

                res.send({ message: "Prescription deleted successfully" });
            } catch (err) {
                console.error(err);
                res.status(500).send({ error: "Failed to delete prescription" });
            }
        });

        // POST send prescription email
        app.post("/prescriptions/:id/send-email", async (req, res) => {
            try {
                const { id } = req.params;
                const prescription = await prescriptionsCollection.findOne({ _id: new ObjectId(id) });

                if (!prescription) {
                    return res.status(404).send({ error: "Prescription not found" });
                }

                if (!prescription.patientId || !prescription.patientId.includes('@')) {
                    return res.status(400).send({ error: "Invalid patient email address" });
                }

                const emailResult = await sendPrescriptionEmail(prescription);

                if (emailResult.success) {
                    res.send({ 
                        message: "Prescription email sent successfully",
                        messageId: emailResult.messageId 
                    });
                } else {
                    res.status(500).send({ 
                        error: "Failed to send email",
                        details: emailResult.error 
                    });
                }
            } catch (err) {
                console.error(err);
                res.status(500).send({ error: "Failed to send prescription email" });
            }
        });

        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");

        app.listen(port, () => {
            console.log(`Server is running on port ${port}`);
        });
    }
    catch (err) {
        console.error(err);
        process.exit(1);
    }
}
run();
