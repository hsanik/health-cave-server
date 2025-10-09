require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.g6mzkoi.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
console.log(process.env.DB_USER, process.env.DB_PASS);

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

                // Add userId to doctor data (this should match the authenticated user's session ID)
                doctorData.userId = doctorData.userId || id; // Fallback to application ID if userId not provided

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

                // Try to update by _id first, then by userId if not found
                let result = await doctorsCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: { availability: availability } }
                );

                if (result.matchedCount === 0) {
                    // Try updating by userId
                    result = await doctorsCollection.updateOne(
                        { userId: id },
                        { $set: { availability: availability } }
                    );
                }

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

                // Try to find by _id first, then by userId if not found
                let doctor = await doctorsCollection.findOne(
                    { _id: new ObjectId(id) },
                    { projection: { availability: 1 } }
                );

                if (!doctor) {
                    // Try finding by userId
                    doctor = await doctorsCollection.findOne(
                        { userId: id },
                        { projection: { availability: 1 } }
                    );
                }

                if (!doctor) {
                    return res.status(404).send({ error: "Doctor not found" });
                }

                res.send({ availability: doctor.availability || [] });
            } catch (err) {
                console.error(err);
                res.status(500).send({ error: "Failed to fetch availability" });
            }
        });

        // GET check if user is a doctor
        app.get("/doctors/check/:userId", async (req, res) => {
            try {
                const { userId } = req.params;

                // Build query conditions
                const queryConditions = [{ userId: userId }];

                // Only add ObjectId condition if userId is a valid ObjectId
                try {
                    const objectId = new ObjectId(userId);
                    queryConditions.push({ _id: objectId });
                } catch (e) {
                    // userId is not a valid ObjectId, skip the _id condition
                }

                // Check if user exists in doctors collection
                const doctor = await doctorsCollection.findOne({
                    $or: queryConditions
                });

                if (doctor) {
                    res.send({ isDoctor: true, doctor: doctor });
                } else {
                    res.send({ isDoctor: false });
                }
            } catch (err) {
                console.error(err);
                res.status(500).send({ error: "Failed to check doctor status" });
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
