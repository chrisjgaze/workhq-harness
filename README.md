# WorkHQ Demo Assets

Local demo hub, trigger UIs, and a small Node proxy for WorkHQ API calls and mock event sources.

## What's Included

- A browser-based demo hub for WorkHQ trigger scenarios.
- Demo pages for API calls, invoices, email, file drop, KYC, Slack, and Salesforce.
- A local Express proxy for WorkHQ authentication, WorkHQ API calls, S3 file drops, and local mock events.
- Sample payloads and implementation notes for local testing.

## Prerequisites

- Node.js 18 or newer.
- npm.
- Python 3, used only for the local static web server.
- WorkHQ tenant and service account details for API-backed flows.

## Install

```sh
npm install
```

## Configure WorkHQ

Create a local config file from the example:

```sh
cp config/workhq-config.example.json config/workhq-config.json
```

Then edit `config/workhq-config.json` with your tenant domain, tenant ID, client ID, client secret, region, and default environment ID.

The real config file is ignored by git so credentials stay local.

## Optional S3 Config

The file-drop page can send objects to S3 through the local proxy. Set these environment variables before running the proxy if you need that flow:

```sh
export AWS_REGION=eu-central-1
export S3_BUCKET_NAME=your-demo-bucket
export AWS_ACCESS_KEY_ID=your-access-key
export AWS_SECRET_ACCESS_KEY=your-secret-key
```

## Run Locally

```sh
npm run dev
```

This starts both local services:

- Demo hub: `http://localhost:8080`
- Proxy: `http://localhost:3000`

## Useful Commands

```sh
npm run proxy
npm run web
npm test
```

## Project Layout

- `public/` - browser-facing demo hub, pages, images, and archived web pages.
- `server/` - Node/Express proxy and local API endpoints.
- `config/` - local WorkHQ configuration.
- `data/` - mutable local runtime state, such as cached environments and Slack events.
- `samples/` - example payloads and test data.
- `docs/` - setup notes and implementation guides.
- `notes/` - scratch notes kept out of the runtime path.
