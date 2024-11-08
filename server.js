const { Client } = require("pg");
const express = require("express");
const app = express();
const cors = require("cors");
app.use(cors());

const password = encodeURIComponent("HTAobTAFd1txFcEeZQWusaTgdTT0U62T");
const connectionString = `postgresql://i2u_db_user:${password}@dpg-csmt0u1u0jms73fsvgrg-a.oregon-postgres.render.com/i2u_db`;

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
    const posts = rows.map(function (row) {
      const dateString = row.post_published_date.toString();
      const month = dateString.split(" ")[1];
      const date = dateString.split(" ")[2];
      const final_date = month + " " + date;
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

app.listen(5000, () => {
  console.log("Server started on port 5000");
});
