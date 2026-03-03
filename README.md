# Bitespeed Identity Reconciliation Service

A backend REST API that identifies and tracks customer identity across multiple purchases by consolidating contacts that share an email or phone number.

---

## 🧠 How It Works

When a customer places an order, they may use different emails or phone numbers. This service links all those contact records together under one **primary** contact, so Bitespeed always knows it's the same person.

- The **oldest** matching contact becomes the `primary`
- All newer or linked contacts become `secondary`
- Two separate primary contacts **can be merged** — if a request links them, the newer one becomes secondary
- A single `/identify` endpoint handles all lookup and consolidation logic

---

## 🛠️ Prerequisites

Make sure you have the following installed:

- [Node.js](https://nodejs.org/) v20 or higher
- npm (comes with Node.js)

---

## 🚀 Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/SayujGupta2005/Identity-reconciliation.git
cd Identity-reconciliation
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up environment variables

Create a `.env` file in the root directory:

```env
DATABASE_URL="file:./dev.db"
PORT=3000
```

> The app uses **SQLite** by default, so no external database setup is required.

### 4. Generate the Prisma client

```bash
npx prisma generate
```

### 5. Run database migrations

```bash
npx prisma migrate dev --name init
```

> If a `dev.db` file already exists in the root (from a previous run), this step may be skipped.

### 6. Start the server

```bash
npm run dev
```

You should see:

```
Server running on port 3000
```

### 7. (Optional) View the database visually

```bash
npx prisma studio
```

Opens a GUI at `http://localhost:5555` to browse and inspect contact records.

---

## 📡 API Reference

### `POST /identify`

Identifies a contact and consolidates linked identities.

**URL:** `http://localhost:3000/identify`

**Request Body** (JSON):

| Field         | Type             | Required                              |
|---------------|------------------|---------------------------------------|
| `email`       | string \| null   | At least one of these must be present |
| `phoneNumber` | string \| null   | At least one of these must be present |

**Response Format:**

```json
{
  "contact": {
    "primaryContactId": number,
    "emails": ["string"],
    "phoneNumbers": ["string"],
    "secondaryContactIds": [number]
  }
}
```

> `emails[0]` is always the primary contact's email.  
> `phoneNumbers[0]` is always the primary contact's phone number.

---

## 🧪 Test Cases (from the Official PDF)

> ⚠️ **Run these in order** — each test builds on the state left by the previous one.  
> Start with a **fresh/empty database** for reproducible results. You can clear it by deleting `dev.db` and re-running `npx prisma migrate dev --name init`.

---

### ✅ Test Case 1 — Brand new contact (creates a Primary)

A contact that matches nothing in the database. A new **primary** contact is created.

**Request:**
```json
{
  "email": "lorraine@hillvalley.edu",
  "phoneNumber": "123456"
}
```

**PowerShell:**
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/identify" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"email": "lorraine@hillvalley.edu", "phoneNumber": "123456"}' | ConvertTo-Json -Depth 5
```

**curl (macOS/Linux/Git Bash):**
```bash
curl -X POST http://localhost:3000/identify \
  -H "Content-Type: application/json" \
  -d '{"email": "lorraine@hillvalley.edu", "phoneNumber": "123456"}'
```

**Expected Response:**
```json
{
  "contact": {
    "primaryContactId": 1,
    "emails": ["lorraine@hillvalley.edu"],
    "phoneNumbers": ["123456"],
    "secondaryContactIds": []
  }
}
```

---

### ✅ Test Case 2 — Existing phone, new email (creates a Secondary)

The phone `123456` already exists (Contact 1). The email `mcfly@hillvalley.edu` is new → a **secondary** contact is created and linked to Contact 1.

**Request:**
```json
{
  "email": "mcfly@hillvalley.edu",
  "phoneNumber": "123456"
}
```

**PowerShell:**
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/identify" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"email": "mcfly@hillvalley.edu", "phoneNumber": "123456"}' | ConvertTo-Json -Depth 5
```

**curl (macOS/Linux/Git Bash):**
```bash
curl -X POST http://localhost:3000/identify \
  -H "Content-Type: application/json" \
  -d '{"email": "mcfly@hillvalley.edu", "phoneNumber": "123456"}'
```

**Expected Response:**
```json
{
  "contact": {
    "primaryContactId": 1,
    "emails": ["lorraine@hillvalley.edu", "mcfly@hillvalley.edu"],
    "phoneNumbers": ["123456"],
    "secondaryContactIds": [2]
  }
}
```

> **DB after this step:**  
> - Contact 1: `lorraine@hillvalley.edu` / `123456` → `primary`  
> - Contact 2: `mcfly@hillvalley.edu` / `123456` → `secondary`, linkedId = 1

---

### ✅ Test Case 3 — All equivalent lookups return the same result

After Test Case 2, **all** of the following requests must return the **same** consolidated response as above. This verifies correct identity consolidation regardless of which field is queried.

**3a — Lookup by phone only:**
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/identify" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"email": null, "phoneNumber": "123456"}' | ConvertTo-Json -Depth 5
```

**3b — Lookup by primary email only:**
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/identify" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"email": "lorraine@hillvalley.edu", "phoneNumber": null}' | ConvertTo-Json -Depth 5
```

**3c — Lookup by secondary email only:**
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/identify" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"email": "mcfly@hillvalley.edu", "phoneNumber": null}' | ConvertTo-Json -Depth 5
```

**Expected Response for ALL three above:**
```json
{
  "contact": {
    "primaryContactId": 1,
    "emails": ["lorraine@hillvalley.edu", "mcfly@hillvalley.edu"],
    "phoneNumbers": ["123456"],
    "secondaryContactIds": [2]
  }
}
```

---

### ✅ Test Case 4 — Two separate primaries get merged

First, create **two independent primary contacts** (do this on a fresh DB, or note their IDs):

**Step 4a — Create first primary:**
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/identify" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"email": "george@hillvalley.edu", "phoneNumber": "919191"}' | ConvertTo-Json -Depth 5
```

> Expected: Creates Contact with `primary`, id = N (e.g. `11`)

**Step 4b — Create second primary:**
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/identify" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"email": "biffsucks@hillvalley.edu", "phoneNumber": "717171"}' | ConvertTo-Json -Depth 5
```

> Expected: Creates another `primary`, id = M (e.g. `27`)

**Step 4c — Link them with a request that matches both:**
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/identify" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"email": "george@hillvalley.edu", "phoneNumber": "717171"}' | ConvertTo-Json -Depth 5
```

**curl (macOS/Linux/Git Bash):**
```bash
curl -X POST http://localhost:3000/identify \
  -H "Content-Type: application/json" \
  -d '{"email": "george@hillvalley.edu", "phoneNumber": "717171"}'
```

**Expected Response:**
```json
{
  "contact": {
    "primaryContactId": 11,
    "emails": ["george@hillvalley.edu", "biffsucks@hillvalley.edu"],
    "phoneNumbers": ["919191", "717171"],
    "secondaryContactIds": [27]
  }
}
```

> **What happened:** Contact 27 (`biffsucks`) was originally primary. Because Contact 11 (`george`) is **older**, contact 27 gets demoted to `secondary` and its `linkedId` is updated to `11`.

---

### ❌ Test Case 5 — Missing both fields (Error case)

**Request:**
```json
{}
```

**PowerShell:**
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/identify" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{}' | ConvertTo-Json -Depth 5
```

**Expected Response (HTTP 400):**
```json
{
  "error": "Email or phone number is required."
}
```

---

## 🔗 Logic Summary

| Scenario | Behaviour |
|---|---|
| No match in DB | Create new **primary** contact |
| Match found, no new info | Return existing consolidated contact |
| Match found, new email/phone | Create **secondary** contact linked to primary |
| Two separate primaries matched | Older one stays primary, newer becomes **secondary** |
| Query by phone or email only | Returns full consolidated contact |

---

## 📁 Project Structure

```
├── prisma/
│   ├── schema.prisma        # Database schema (Contact model)
│   └── migrations/          # Migration history
├── src/
│   ├── index.ts             # Express app + /identify endpoint
│   └── generated/prisma/    # Auto-generated Prisma client (do not edit)
├── prisma.config.ts         # Prisma v7 configuration
├── tsconfig.json            # TypeScript configuration
├── .env                     # Environment variables (not committed)
└── package.json
```

---

## 🔧 Tech Stack

| Technology | Purpose |
|---|---|
| **Node.js + TypeScript** | Runtime & type safety |
| **Express v5** | HTTP server framework |
| **Prisma ORM v7** | Type-safe database access |
| **SQLite** (via `better-sqlite3`) | Lightweight local database |
| **tsx** | TypeScript execution (ESM) |

---

## 📝 Notes

- The `src/generated/prisma/` directory is auto-generated by `npx prisma generate`. Do **not** manually edit those files.
- The `dev.db` file is your local SQLite database. It stores all contact data between runs.
- This project uses **Prisma v7** which requires ESM (`"type": "module"` in `package.json`) and the new driver adapter pattern.
- To reset the database to a clean state: delete `dev.db` and run `npx prisma migrate dev --name init` again.
