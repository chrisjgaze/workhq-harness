# WorkHQ S3 File Drop Harness

This guide explains how to extend the local `server/proxy.js` server to support a file-drop trigger using AWS S3 and WorkHQ.

The flow will be:

```text
public/pages/FileDrop.html
    ↓
server/proxy.js (/drop-file)
    ↓
AWS S3 Bucket
    ↓
WorkHQ "New File" Trigger
```

---

# 1. Install AWS SDK

Install the AWS SDK for S3:

```bash
npm install @aws-sdk/client-s3
```

---

# 2. Update `server/proxy.js`

Add the AWS imports near the top of the file:

```js
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
```

Create the S3 client:

```js
const s3 = new S3Client({
  region: process.env.AWS_REGION
});
```

---

# 3. Add `/drop-file` Endpoint

Add this Express endpoint to `server/proxy.js`:

```js
app.post("/drop-file", async (req, res) => {
  try {
    const { fileName, contentType, content } = req.body;

    if (!fileName || !content) {
      return res.status(400).json({
        ok: false,
        error: "fileName and content are required"
      });
    }

    const bucketName = process.env.S3_BUCKET_NAME;

    const key = `workhq-demo/${Date.now()}-${fileName}`;

    await s3.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: content,
        ContentType: contentType || "application/json"
      })
    );

    res.json({
      ok: true,
      channel: "s3",
      bucket: bucketName,
      key
    });

  } catch (err) {
    res.status(500).json({
      ok: false,
      error: String(err)
    });
  }
});
```

---

# 4. Configure Environment Variables

Set the following environment variables before starting the proxy:

```bash
export AWS_REGION=eu-central-1
export S3_BUCKET_NAME=your-demo-bucket
export AWS_ACCESS_KEY_ID=your-access-key
export AWS_SECRET_ACCESS_KEY=your-secret-key
```

Start the proxy:

```bash
npm run proxy
```

---

# 5. Configure `public/pages/FileDrop.html`

The UI should send requests to the local proxy:

```js
fetch("http://localhost:3000/drop-file", {
  method: "POST",
  headers: {
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    fileName: "INV-10045.json",
    contentType: "application/json",
    content: JSON.stringify(payload, null, 2)
  })
});
```

---

# 6. Example Payload

```json
{
  "eventId": "EVT-12345",
  "eventType": "file_created",
  "receivedAt": "2026-01-21T10:15:00Z",
  "source": "mock-filedrop-html",
  "businessObject": {
    "fileName": "INV-10045.json",
    "folder": "/workhq-demo/invoices",
    "contentType": "application/json",
    "content": {
      "invoiceId": "INV-10045",
      "supplierName": "Acme Trading LLC",
      "amount": 12500.75,
      "currency": "AED"
    }
  },
  "request": {
    "priority": "medium",
    "requiresApproval": true,
    "source": "mock-filedrop-html"
  }
}
```

---

# 7. Configure WorkHQ

In WorkHQ:

1. Create a workflow
2. Add trigger:
   - Connector: AWS S3
   - Trigger: New File
3. Configure:
   - Bucket: `your-demo-bucket`
   - Prefix: `workhq-demo/`

Now every uploaded file will trigger the workflow automatically.

---

# 8. Result

You now have a complete demo harness for:

- File-based workflow triggers
- Cloud storage events
- Document ingestion
- AI/document processing scenarios
- Human-uploaded content simulations

This works well for invoice processing, claims intake, onboarding documents, and AI extraction demos.
