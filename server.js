const { Client } = require("pg");
const express = require("express");
const app = express();
const cors = require("cors");
const dotenv = require("dotenv");
dotenv.config();
app.use(cors());

const connectionString = process.env.DATABASE_URL;

const client = new Client({
  connectionString: connectionString,
  ssl: {
    rejectUnauthorized: false,
  },
});

client
  .connect()
  .then(() => console.log("Connected to PostgreSQL database"))
  .catch((err) => console.error("Database connection error:", err));

app.get("/getPost", async (req, res) => {
  try {
    const { rows } = await client.query(`SELECT * FROM POSTS`);

    if (rows.length === 0) {
      return res.status(400).json({ message: "No posts found" });
    }
    const sortedRows = rows.sort(
      (a, b) =>
        new Date(b.post_published_date) - new Date(a.post_published_date)
    );

    const posts = sortedRows.map(function (row) {
      const dateString = row.post_published_date.toString();
      const month = dateString.split(" ")[1];
      const date = dateString.split(" ")[2];
      const final_date = `${month} ${date}`;
      return {
        id: row.post_id,
        title: row.post_title,
        date: final_date,
        content: row.post_content,
        url: row.post_image_url,
      };
    });
    return res.status(200).json({
      posts: posts,
      message: "Users fetched successfully",
    });
  } catch (err) {
    console.error("error executing query", err);
    return res
      .status(500)
      .json({ message: "An error occurred while fetching posts" });
  }
});

app.listen(process.env.PORT, () => {
  console.log(`Server started on port ${process.env.PORT}`);
});
