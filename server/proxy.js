const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { S3Client, PutObjectCommand, ListObjectsV2Command } = require("@aws-sdk/client-s3");

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

const port = process.env.PORT || 3000;
const projectRoot = path.resolve(__dirname, "..");
const s3 = new S3Client({
  region: process.env.AWS_REGION
});

const workhqConfigPath = path.join(projectRoot, "config", "workhq-config.json");
const workhqEnvironmentsPath = path.join(projectRoot, "data", "workhq-environments.json");
const slackEventsPath = path.join(projectRoot, "data", "slack-events.json");

function loadWorkHQConfig() {
  const fileConfig = fs.existsSync(workhqConfigPath)
    ? JSON.parse(fs.readFileSync(workhqConfigPath, "utf8"))
    : {};
  const workhq = fileConfig.workhq || {};

  return {
    tenantId: process.env.WORKHQ_TENANT_ID || workhq.tenantId || "",
    domain: process.env.WORKHQ_TENANT_DOMAIN || workhq.tenantDomain || "",
    clientId: process.env.WORKHQ_CLIENT_ID || workhq.clientId || "",
    clientSecret: process.env.WORKHQ_CLIENT_SECRET || workhq.clientSecret || "",
    region: process.env.WORKHQ_REGION || workhq.region || "eu-central",
    environmentId: process.env.WORKHQ_ENVIRONMENT_ID || workhq.environmentId || "",
    defaultPageSize: Number(process.env.WORKHQ_PAGE_SIZE || workhq.defaultPageSize || 25)
  };
}

function writeWorkHQConfigValue(key, value) {
  const fileConfig = fs.existsSync(workhqConfigPath)
    ? JSON.parse(fs.readFileSync(workhqConfigPath, "utf8"))
    : {};

  fileConfig.workhq = fileConfig.workhq || {};
  fileConfig.workhq[key] = value;
  fs.writeFileSync(workhqConfigPath, `${JSON.stringify(fileConfig, null, 2)}\n`);
}

function loadWorkHQEnvironments() {
  if (!fs.existsSync(workhqEnvironmentsPath)) {
    return {
      defaultEnvironmentId: "",
      syncedAt: null,
      environments: []
    };
  }

  const data = JSON.parse(fs.readFileSync(workhqEnvironmentsPath, "utf8"));

  return {
    defaultEnvironmentId: data.defaultEnvironmentId || "",
    syncedAt: data.syncedAt || null,
    environments: Array.isArray(data.environments) ? data.environments : []
  };
}

function saveWorkHQEnvironments(data) {
  fs.writeFileSync(workhqEnvironmentsPath, `${JSON.stringify(data, null, 2)}\n`);
}

function normalizeEnvironment(item) {
  const source = item?.entity || item?.environment || item;
  const id =
    source.id ||
    source.environmentId ||
    source.environmentID ||
    source.environment_id ||
    source.environmentKey ||
    source.key ||
    source.Id ||
    source.ID ||
    source.guid ||
    source.uuid ||
    source?.id?.value ||
    source?.environmentId?.value ||
    "";
  const name =
    source.name ||
    source.displayName ||
    source.environmentName ||
    source.Name ||
    source.DisplayName ||
    source?.name?.value ||
    source?.displayName?.value ||
    "Unnamed environment";

  return {
    id,
    name,
    raw: item
  };
}

function collectArrays(value, arrays = []) {
  if (Array.isArray(value)) {
    arrays.push(value);
    value.forEach(item => collectArrays(item, arrays));
    return arrays;
  }

  if (!value || typeof value !== "object") {
    return arrays;
  }

  Object.values(value).forEach(item => collectArrays(item, arrays));
  return arrays;
}

function extractEnvironments(value) {
  const arrays = collectArrays(value);
  const candidates = arrays
    .map(source => ({
      source,
      environments: source.map(normalizeEnvironment).filter(environment => environment.id)
    }))
    .filter(candidate => candidate.environments.length);

  if (!candidates.length) {
    const keyed = collectEnvironmentObjects(value);

    if (keyed.length) {
      return {
        source: keyed,
        environments: keyed.map(normalizeEnvironment).filter(environment => environment.id)
      };
    }

    return {
      source: arrays[0] || [],
      environments: []
    };
  }

  candidates.sort((a, b) => b.environments.length - a.environments.length);

  return candidates[0];
}

function collectEnvironmentObjects(value, found = []) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return found;
  }

  const environment = normalizeEnvironment(value);

  if (environment.id) {
    found.push(value);
    return found;
  }

  Object.values(value).forEach(item => collectEnvironmentObjects(item, found));
  return found;
}

async function callWorkHQApi({ base = "managementPlatform", method = "GET", requestPath = "", query = "", body }) {
  const config = getWorkHQConfig();
  const bases = getWorkHQBases(config);

  if (!bases[base]) {
    throw new Error(`Unknown base '${base}'`);
  }

  if (!requestPath.startsWith("/")) {
    throw new Error("path must start with /");
  }

  const tokenData = await getWorkHQToken();
  const url = `${bases[base]}${requestPath}${query ? `?${query.replace(/^\?/, "")}` : ""}`;
  const upperMethod = method.toUpperCase();
  const requestBody = ["GET", "DELETE"].includes(upperMethod) ? undefined : JSON.stringify(body || {});

  const upstreamRes = await fetch(url, {
    method: upperMethod,
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "Authorization": `Bearer ${tokenData.access_token}`
    },
    body: requestBody
  });

  const responseText = await upstreamRes.text();
  let responseBody = responseText;

  try {
    responseBody = responseText ? JSON.parse(responseText) : null;
  } catch (err) {
    responseBody = responseText;
  }

  return {
    ok: upstreamRes.ok,
    request: {
      method: upperMethod,
      url
    },
    status: upstreamRes.status,
    statusText: upstreamRes.statusText,
    body: responseBody
  };
}

function getWorkHQConfig() {
  const config = loadWorkHQConfig();
  const missing = ["tenantId", "domain", "clientId", "clientSecret"].filter(key => !config[key]);

  if (missing.length) {
    throw new Error(`Missing WorkHQ config: ${missing.join(", ")}`);
  }

  return config;
}

function getWorkHQBases(config) {
  return {
    managementPlatform: `https://${config.domain}/api/platform/rest/v1`,
    managementRpa: `https://${config.domain}/api/rpa/rest/v1`,
    operatingPlatform: `https://${config.domain}/regions/${config.region}/api/platform/rest/v1`,
    operatingRpa: `https://${config.domain}/regions/${config.region}/api/rpa/rest/v1`
  };
}

async function getWorkHQToken() {
  const config = getWorkHQConfig();
  const url = `https://${config.domain}/realms/${config.tenantId}/protocol/openid-connect/token`;

  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "client_credentials"
  });

  const tokenRes = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: body.toString()
  });

  const data = await tokenRes.json();

  if (!tokenRes.ok) {
    throw new Error(data.error_description || data.error || `Token request failed with HTTP ${tokenRes.status}`);
  }

  return data;
}


app.get("/token", async (req, res) => {
  try {
    res.json(await getWorkHQToken());
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/workhq-config", (req, res) => {
  try {
    const config = loadWorkHQConfig();
    const bases = getWorkHQBases(config);
    const environmentCache = loadWorkHQEnvironments();
    const environmentId = environmentCache.defaultEnvironmentId || config.environmentId;

    res.json({
      ok: true,
      tenantDomain: config.domain,
      tenantId: config.tenantId,
      clientId: config.clientId,
      clientSecretConfigured: Boolean(config.clientSecret),
      region: config.region,
      environmentId,
      defaultPageSize: config.defaultPageSize,
      environments: environmentCache.environments,
      environmentsSyncedAt: environmentCache.syncedAt,
      bases
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

app.post("/workhq-api", async (req, res) => {
  try {
    const { base = "operatingRpa", method = "GET", path: requestPath = "", query = "", body } = req.body;
    const apiResult = await callWorkHQApi({ base, method, requestPath, query, body });

    res.status(apiResult.status === 204 ? 200 : apiResult.status).json(apiResult);
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

app.get("/workhq-environments", (req, res) => {
  try {
    res.json({
      ok: true,
      ...loadWorkHQEnvironments()
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

app.post("/workhq-environments/sync", async (req, res) => {
  try {
    const apiResult = await callWorkHQApi({
      base: "managementPlatform",
      method: "GET",
      requestPath: "/environments"
    });

    if (!apiResult.ok) {
      return res.status(apiResult.status === 204 ? 200 : apiResult.status).json(apiResult);
    }

    const responseBody = apiResult.body || {};
    const { source, environments } = extractEnvironments(responseBody);

    if (source.length && !environments.length) {
      return res.status(500).json({
        ok: false,
        error: "Environment records were returned, but no environment IDs could be recognized.",
        sourceCount: source.length,
        sample: source[0]
      });
    }

    const current = loadWorkHQEnvironments();
    const config = loadWorkHQConfig();
    const currentDefault = current.defaultEnvironmentId || config.environmentId;
    const defaultEnvironmentId = environments.some(environment => environment.id === currentDefault)
      ? currentDefault
      : environments[0]?.id || "";
    const data = {
      defaultEnvironmentId,
      syncedAt: new Date().toISOString(),
      environments
    };

    saveWorkHQEnvironments(data);

    if (defaultEnvironmentId) {
      writeWorkHQConfigValue("environmentId", defaultEnvironmentId);
    }

    res.json({
      ok: true,
      ...data,
      sourceCount: source.length,
      sourceStatus: apiResult.status
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

app.post("/workhq-environments/default", (req, res) => {
  try {
    const { environmentId } = req.body;
    const data = loadWorkHQEnvironments();

    if (!environmentId) {
      return res.status(400).json({ ok: false, error: "environmentId is required" });
    }

    if (!data.environments.some(environment => environment.id === environmentId)) {
      return res.status(400).json({ ok: false, error: "environmentId was not found in workhq-environments.json" });
    }

    data.defaultEnvironmentId = environmentId;
    saveWorkHQEnvironments(data);
    writeWorkHQConfigValue("environmentId", environmentId);

    res.json({
      ok: true,
      ...data
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

app.post("/proxy", async (req, res) => {
  try {
    const { endpoint, method, token, body } = req.body;

    const upstreamRes = await fetch(endpoint, {
      method,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: ["GET", "DELETE"].includes(method) ? undefined : JSON.stringify(body)
    });

    const responseText = await upstreamRes.text();

    res.status(upstreamRes.status).json({
      status: upstreamRes.status,
      statusText: upstreamRes.statusText,
      body: responseText
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

function loadSlackEvents() {
  if (!fs.existsSync(slackEventsPath)) {
    return [];
  }

  const data = JSON.parse(fs.readFileSync(slackEventsPath, "utf8"));
  return Array.isArray(data) ? data : [];
}

function saveSlackEvents(events) {
  fs.writeFileSync(slackEventsPath, `${JSON.stringify(events, null, 2)}\n`);
}

app.get("/slack-events", (req, res) => {
  try {
    res.json({
      ok: true,
      events: loadSlackEvents().slice(-50).reverse()
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

app.post("/post-slack", async (req, res) => {
  try {
    const { channel, user = "demo.user", text, metadata } = req.body;

    if (!channel || !text) {
      return res.status(400).json({
        ok: false,
        error: "channel and text are required"
      });
    }

    const event = {
      id: `SLK-${Date.now()}`,
      receivedAt: new Date().toISOString(),
      channel,
      user,
      text,
      metadata
    };
    const events = loadSlackEvents();

    events.push(event);
    saveSlackEvents(events.slice(-200));

    res.json({
      ok: true,
      channel: "local-slack-mock",
      event
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

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

    if (!bucketName) {
      return res.status(500).json({
        ok: false,
        error: "S3_BUCKET_NAME environment variable is required"
      });
    }

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

app.get("/list-files", async (req, res) => {
  try {
    const bucketName = process.env.S3_BUCKET_NAME;
    const prefix = process.env.S3_PREFIX || "workhq-demo/";

    if (!bucketName) {
      return res.status(500).json({
        ok: false,
        error: "S3_BUCKET_NAME environment variable is required"
      });
    }

    const data = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: prefix,
        MaxKeys: 100
      })
    );

    const files = (data.Contents || [])
      .filter(item => item.Key !== prefix)
      .map(item => ({
        key: item.Key,
        fileName: item.Key.replace(prefix, ""),
        size: item.Size,
        lastModified: item.LastModified
      }))
      .sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));

    res.json({
      ok: true,
      channel: "s3",
      bucket: bucketName,
      prefix,
      files
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: String(err)
    });
  }
});

app.listen(port, () => {
  console.log(`Proxy running on http://localhost:${port}`);
});
