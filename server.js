const express = require("express");
const app = express();
const { Client } = require("pg");
const cors = require("cors");
const dotenv = require("dotenv");
const { createLogger, format, transports } = require("winston");
dotenv.config();

// Configure Winston logger
const logger = createLogger({
  format: format.combine(
    format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    format.errors({ stack: true }),
    format.splat(),
    format.json()
  ),
  defaultMeta: { service: 'posts-service' },
  transports: [
    new transports.File({ filename: 'error.log', level: 'error' }),
    new transports.File({ filename: 'combined.log' }),
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.simple()
      )
    })
  ]
});

app.use(cors());
app.use(express.json());

const connectionString = process.env.DATABASE_URL;

const client = new Client({
  connectionString: connectionString,
  ssl: {
    rejectUnauthorized: false,
  },
});

client.connect((err) => {
  if (err) {
    logger.error('Error connecting to database:', err);
  } else {
    logger.info('Connected to database successfully');
  }
});

app.get("/getPost", async (req, res) => {
  try {
    const { page } = req.query;
    const { rows } = await client.query(
      `SELECT * FROM POSTS WHERE post_page = $1`,
      [page]
    );
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
        content_type: row.post_content_type,
        url: row.post_image_url,
      };
    });
    return res.status(200).json({
      posts: posts,
      message: "Users fetched successfully",
    });
  } catch (err) {
    logger.error("error executing query", err);
    return res
      .status(500)
      .json({ message: "An error occurred while fetching posts" });
  }
});

app.post("/publishPost", async(req,res)=>{
  try {
    const { content, formData } = req.body;
    if (!content || !formData) {
      logger.warn('Missing required fields in request body');
      return res.status(400).json({ error: "Missing required fields" });
    }
    
    const now = new Date();
    const istTime = new Date(now.getTime() + (330 * 60000));
    const formattedDateTime = istTime.toISOString().slice(0, 19).replace('T', ' ');
    const content_type = 'markup'
    const query = `INSERT INTO POSTS(post_page, post_title, post_published_date, post_content, post_content_type, post_image_url) VALUES($1, $2, $3, $4, $5, $6)`;
    const values = [formData.category, formData.title, formattedDateTime, content, content_type, null];
    
    logger.info('Attempting to insert new post', {
      category: formData.category,
      title: formData.title,
      timestamp: formattedDateTime
    });

    const result = await client.query(query, values);
    logger.info('Post published successfully', { postId: result.rows[0]?.id });

    res.status(200).json({ message: "Post published successfully" });
  } catch (err) {
    logger.error('Error publishing post:', {
      error: err.message,
      stack: err.stack
    });
    res.status(500).json({ error: "Failed to publish post", details: err.message });
  }
});

app.listen(process.env.PORT, () => {
  logger.info(`Server started on port ${process.env.PORT}`);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (error) => {
  logger.error('Unhandled Rejection:', error);
  process.exit(1);
});
