const express = require('express');
const router = express.Router();
const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

// Configure AWS
const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION
});

// Generate pre-signed URL for client-side upload
router.post('/presign', async (req, res) => {
    try {
        const { fileName, fileType } = req.body;
        const fileKey = `posts/${uuidv4()}-${fileName}`;

        // Generate pre-signed URL
        const presignedUrl = await s3.getSignedUrlPromise('putObject', {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: fileKey,
            ContentType: fileType,
            Expires: 300 // URL expires in 5 minutes
        });

        // Generate public URL
        const publicUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileKey}`;

        res.json({
            uploadUrl: presignedUrl,
            publicUrl,
            key: fileKey
        });
    } catch (error) {
        console.error('Error generating pre-signed URL:', error);
        res.status(500).json({ error: 'Failed to generate upload URL' });
    }
});

module.exports = router;
