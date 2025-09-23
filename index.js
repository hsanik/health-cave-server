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
