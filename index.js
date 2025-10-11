require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

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

                const result = await appointmentsCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: { status: status, updatedAt: new Date() } }
                );

                if (result.matchedCount === 0) {
                    return res.status(404).send({ error: "Appointment not found" });
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
