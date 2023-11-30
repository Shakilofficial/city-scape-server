const express = require("express");
const app = express();
require("dotenv").config();
const cors = require("cors");
const cookieParser = require("cookie-parser");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");
const morgan = require("morgan");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const port = process.env.PORT || 5000;

// middleware
const corsOptions = {
  origin: ["http://localhost:5173", "http://localhost:5174","https://cityscape-93609.web.app"],
  credentials: true,
  optionSuccessStatus: 200,
};
app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());
app.use(morgan("dev"));

const verifyToken = async (req, res, next) => {
  const token = req.cookies?.token;
  console.log(token);
  if (!token) {
    return res.status(401).send({ message: "unauthorized access" });
  }
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      console.log(err);
      return res.status(401).send({ message: "unauthorized access" });
    }
    req.user = decoded;
    next();
  });
};

const client = new MongoClient(process.env.DB_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
async function run() {
  try {
    const usersCollection = client.db("cityScapeDb").collection("users");
    const reviewsCollection = client.db("cityScapeDb").collection("reviews");
    const wishlistCollection = client.db("cityScapeDb").collection("wishlist");
    const buyingCollection = client.db("cityScapeDb").collection("buying");
    const propertiesCollection = client
      .db("cityScapeDb")
      .collection("properties");
    // auth related api
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      console.log("I need a new jwt", user);
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "365d",
      });
      res
        .cookie("token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        })
        .send({ success: true });
    });

    // Logout
    app.get("/logout", async (req, res) => {
      try {
        res
          .clearCookie("token", {
            maxAge: 0,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
          })
          .send({ success: true });
        console.log("Logout successful");
      } catch (err) {
        res.status(500).send(err);
      }
    });

    //user Collection
    app.get("/users", verifyToken, async (req, res) => {
      console.log(req.headers);
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    app.get("/users/admin/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user.role === "admin";
      }
      res.send({ admin });
    });

    app.get("/users/agent/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      let agent = false;
      if (user) {
        agent = user.role === "agent";
      }
      res.send({ agent });
    });

    app.get("/users/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await usersCollection.findOne(query);
      res.send(result);
    });

    // Save or modify user email, status in DB
    app.put("/users/:email", async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const query = { email: email };
      const options = { upsert: true };
      const isExist = await usersCollection.findOne(query);
      console.log("User found?----->", isExist);
      if (isExist) return res.send(isExist);
      const result = await usersCollection.updateOne(
        query,
        {
          $set: { ...user, timestamp: Date.now() },
        },
        options
      );
      res.send(result);
    });

    app.patch("/users/admin/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          role: "admin",
        },
      };
      const result = await usersCollection.updateOne(query, updatedDoc);
      res.send(result);
    });

    app.patch("/users/agent/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          role: "agent",
        },
      };
      const result = await usersCollection.updateOne(query, updatedDoc);
      res.send(result);
    });

    app.delete("/users/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await usersCollection.deleteOne(query);
      res.send(result);
    });

    //get all Properties
    app.get("/properties", async (req, res) => {
      try {
        const result = await propertiesCollection.find().toArray();
        res.send(result);
      } catch (error) {
        console.error("Error fetching properties:", error);
        res.status(500).send({ error: "Internal Server Error" });
      }
    });

    //get single Properties

    app.get("/properties/agent/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await propertiesCollection.find(query).toArray();
      res.send(result);
    });

    app.get("/properties/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await propertiesCollection.findOne(query);
      res.send(result);
    });

    //update properties info
    app.patch("/properties/update/:id", async (req, res) => {
      const propertyId = req.params.id;
      const { image, title, location, price } = req.body;
      try {
        const query = { _id: new ObjectId(propertyId) };
        const update = {
          $set: {
            image,
            title,
            location,
            price,
          },
        };
        const result = await propertiesCollection.updateOne(query, update);
        if (result.modifiedCount > 0) {
          res.send({ success: true });
        } else {
          res.status(404).send({ error: "Property not found" });
        }
      } catch (error) {
        console.error("Error updating property:", error);
        res.status(500).send({ error: "Internal Server Error" });
      }
    });

    //update the status of the property
    app.patch("/properties/verify/:id", async (req, res) => {
      const propertyId = req.params.id;
      try {
        const query = { _id: new ObjectId(propertyId) };
        const update = { $set: { status: "Verified" } };
        const result = await propertiesCollection.updateOne(query, update);
        if (result.modifiedCount > 0) {
          res.send({ success: true });
        } else {
          res.status(404).send({ error: "Property not found" });
        }
      } catch (error) {
        console.error("Error verifying property:", error);
        res.status(500).send({ error: "Internal Server Error" });
      }
    });

    app.patch("/properties/reject/:id", async (req, res) => {
      const propertyId = req.params.id;
      try {
        const query = { _id: new ObjectId(propertyId) };
        const update = { $set: { status: "Rejected" } };
        const result = await propertiesCollection.updateOne(query, update);

        if (result.modifiedCount > 0) {
          res.send({ success: true });
        } else {
          res.status(404).send({ error: "Property not found" });
        }
      } catch (error) {
        console.error("Error rejecting property:", error);
        res.status(500).send({ error: "Internal Server Error" });
      }
    });

    app.patch("/accept-offer/:id", async (req, res) => {
      const id = req.params.id;
      try {
        await buyingCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status: "Accepted" } }
        );
        await buyingCollection.updateMany(
          {
            propertyId: req.body.propertyId,
            _id: { $ne: new ObjectId(id) },
          },
          { $set: { status: "Rejected" } }
        );
        res
          .status(200)
          .json({ success: true, message: "Offer accepted successfully" });
      } catch (error) {
        console.error("Error accepting offer:", error.message);
        res
          .status(500)
          .json({ success: false, message: "Internal Server Error" });
      }
    });

    app.patch("/reject-offer/:id", async (req, res) => {
      const id = req.params.id;
      try {
        await buyingCollection.updateMany(
          {
            propertyId: req.body.propertyId,
            _id: { $ne: new ObjectId(id) },
          },
          { $set: { status: "Rejected" } }
        );
        res
          .status(200)
          .json({ success: true, message: "Offer accepted successfully" });
      } catch (error) {
        console.error("Error accepting offer:", error.message);
        res
          .status(500)
          .json({ success: false, message: "Internal Server Error" });
      }
    });

    app.delete("/properties/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await propertiesCollection.deleteOne(query);
      res.send(result);
    });

    //get reviews bt email
    app.get("/reviews/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const reviewItems = await reviewsCollection.find(query).toArray();
      res.send(reviewItems);
    });

    //get all reviews
    app.get("/reviews", async (req, res) => {
      try {
        const result = await reviewsCollection.find().toArray();
        res.send(result);
      } catch (error) {
        console.error("Error fetching reviews:", error);
        res.status(500).send({ error: "Internal Server Error" });
      }
    });

    //post review from the user
    app.post("/reviews", async (req, res) => {
      const reviewItem = req.body;
      const result = await reviewsCollection.insertOne(reviewItem);
      res.send(result);
    });
    //delete from reviews
    app.delete("/reviews/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await reviewsCollection.deleteOne(query);
      res.send(result);
    });

    // Get wishlist items
    app.get("/wishlist", async (req, res) => {
      const wishlistItems = await wishlistCollection.find().toArray();
      res.json(wishlistItems);
    });

    // send data to wishlist
    app.post("/wishlist", async (req, res) => {
      const wishlistItem = req.body;
      const result = await wishlistCollection.insertOne(wishlistItem);
      res.send(result);
    });
    /*     app.get("/wishlist/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await wishlistCollection.findOne(query);
      res.send(result);
    }); */

    app.get("/wishlist/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const wishlistItems = await wishlistCollection.find(query).toArray();
      res.send(wishlistItems);
    });

    //delete from wishlist
    app.delete("/wishlist/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await wishlistCollection.deleteOne(query);
      res.send(result);
    });

    //buying collection
    app.get("/make-offer", async (req, res) => {
      const buyingItems = await buyingCollection.find().toArray();
      res.json(buyingItems);
    });

    app.get("/make-offer/:email", async (req, res) => {
      const email = req.params.email;
      const query = { buyerEmail: email };
      const buyingItems = await buyingCollection.find(query).toArray();
      res.send(buyingItems);
    });

    app.post("/make-offer", async (req, res) => {
      try {
        const buyingItem = req.body;
        const {
          propertyId,
          title,
          location,
          image,
          agent_name,
          offeredAmount,
          buyingDate,
          status,
          buyerEmail,
          buyerName,
        } = buyingItem;

        const result = await buyingCollection.insertOne({
          propertyId: new ObjectId(propertyId),
          title,
          location,
          image,
          agent_name,
          offeredAmount,
          buyingDate,
          status,
          buyerEmail,
          buyerName,
        });

        if (result.insertedId) {
          res
            .status(200)
            .json({ success: true, message: "Offer made successfully" });
        } else {
          res
            .status(500)
            .json({ success: false, message: "Error making offer" });
        }
      } catch (error) {
        console.error("Error making offer:", error);
        res
          .status(500)
          .json({ success: false, message: "Internal Server Error" });
      }
    });

    app.post("/create-payment-intent", async (req, res) => {
      const { price, propertyId } = req.body;
      try {
        const amount = parseInt(price * 100);
        console.log(amount, "Amount for the intent");
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount,
          currency: "usd",
          payment_method_types: ["card"],
        });
        await buyingCollection.updateOne(
          { _id: new ObjectId(propertyId) },
          { $set: { status: "Bought", transactionId: paymentIntent.id } }
        );

        res.send({
          client_secret: paymentIntent.client_secret,
        });
      } catch (error) {
        console.error("Error creating payment intent:", error.message);
        res.status(500).json({ error: "Internal Server Error" });
      }
    });

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello from City Scape Server..");
});

app.listen(port, () => {
  console.log(`City Scape is running on port ${port}`);
});
