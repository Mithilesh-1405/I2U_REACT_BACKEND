const express = require("express");
const app = express();
const { Client } = require("pg");
const cors = require("cors");
const dotenv = require("dotenv");
const multer = require("multer");
const path = require("path");
const fs = require('fs');
const { createLogger, format, transports } = require("winston");
dotenv.config();


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


console.log('Database Connection Config:', {
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,

  passwordLength: process.env.DB_PASSWORD ? process.env.DB_PASSWORD.length : 0
});

const client = new Client({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT),
  database: process.env.DB_NAME,
  ssl: true
});

client.connect((err) => {
  if (err) {
    console.error('Database Connection Error Details:');
    console.error('Error Code:', err.code);
    console.error('Error Message:', err.message);
    console.error('Error Stack:', err.stack);

    if (err.code === '28P01') {
      console.error('Authentication failed. Please check username and password.');
    } else if (err.code === 'ECONNREFUSED') {
      console.error('Connection refused. Please check if:');
      console.error('1. PostgreSQL is running');
      console.error('2. The host and port are correct');
      console.error('3. PostgreSQL is configured to accept connections');
    } else if (err.code === 'ENOTFOUND') {
      console.error('Host not found. Please check:');
      console.error('1. The hostname is correct');
      console.error('2. DNS resolution is working');
      console.error('3. No typos in the host configuration');
    }

    logger.error('Database connection error:', {
      error: {
        code: err.code,
        message: err.message,
        stack: err.stack,
        timestamp: new Date().toISOString(),
        connectionConfig: {
          user: process.env.DB_USER,
          host: process.env.DB_HOST,
          port: process.env.DB_PORT,
          database: process.env.DB_NAME,
          ssl: false
        }
      }
    });
  } else {
    console.log('Successfully connected to PostgreSQL database');
    logger.info('Database connected successfully', {
      timestamp: new Date().toISOString(),
      database: process.env.DB_NAME,
      host: process.env.DB_HOST
    });
  }
});

// Add error handler for connection loss
client.on('error', (err) => {
  console.error('Unexpected database error:', err.message);
  logger.error('Unexpected database error:', {
    error: {
      code: err.code,
      message: err.message,
      stack: err.stack,
      timestamp: new Date().toISOString()
    }
  });
});

const uploadDir = process.env.MODE === 'production'
  ? '/tmp/uploads'
  : path.join(__dirname, '../frontend/public/uploads');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024
  },
  fileFilter: function (req, file, cb) {
    const filetypes = /jpeg|jpg|png|gif/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());

    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Only image files are allowed!'));
  }
});

// Serve uploaded files statically
app.use('/uploads', express.static(uploadDir));
app.get("/",(req,res)=>{
  res.send("Hello this is backend ")
})
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
      const time = dateString.split(" ")[4]; // Get the time portion
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

app.post('/uploadImage', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    // Return the URL that will be accessible from the frontend
    const imageUrl = `/uploads/${req.file.filename}`;
    res.json({ imageUrl });

  } catch (error) {
    logger.error('Error uploading image:', error);
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

app.post("/publishPost", async(req,res)=>{
  try {
    const { content, formData, imageUrl } = req.body;
    if (!content || !formData) {
      logger.warn('Missing required fields in request body');
      return res.status(400).json({ error: "Missing required fields" });
    }

    const now = new Date();
    const istTime = new Date(now.getTime() + (330 * 60000));
    // Format date with time in HH:MM:SS format
    const formattedDateTime = istTime.toISOString().slice(0, 19).replace('T', ' ');
    const content_type = 'markup';

    // Save the complete URL to the database
    const query = `INSERT INTO POSTS(post_page, post_title, post_published_date, post_content, post_content_type, post_image_url) VALUES($1, $2, $3, $4, $5, $6)`;
    const values = [formData.category, formData.title, formattedDateTime, content, content_type, imageUrl];

    logger.info('Attempting to insert new post', {
      category: formData.category,
      title: formData.title,
      timestamp: formattedDateTime,
      imageUrl
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
