# Finance Hub — Setup Guide

## Step 1: Change the PINs

Open `index.html` and find this section near the top of the `<script>` block:

```js
const USERS = {
  elly: { pin: '1234', role: 'admin', displayName: 'Elly', avatar: 'EH' },
  eric: { pin: '5678', role: 'member', displayName: 'Eric', avatar: 'EF' }
};
```

Replace `'1234'` and `'5678'` with PINs you both agree on. Keep them private.

---

## Step 2: Set up Firebase (free real-time sync)

This lets Elly and Eric see the same data from any device.

### 2a. Create a Firebase project
1. Go to https://console.firebase.google.com
2. Click **Add project** → name it `finance-hub` → continue
3. Disable Google Analytics (not needed) → **Create project**

### 2b. Add a Realtime Database
1. In the left sidebar → **Build → Realtime Database**
2. Click **Create Database**
3. Choose your region (e.g. `australia-southeast1`) → **Next**
4. Start in **Test mode** → **Enable**

### 2c. Get your config
1. Click the ⚙ gear icon → **Project settings**
2. Scroll to **Your apps** → click **</>** (Web)
3. Register app name (e.g. `finance-hub-web`) → **Register app**
4. Copy the `firebaseConfig` object shown

### 2d. Paste config into index.html
Find this block in `index.html` and replace the placeholder values:

```js
const firebaseConfig = {
  apiKey:            "PASTE_YOUR_API_KEY",
  authDomain:        "PASTE_YOUR_AUTH_DOMAIN",
  databaseURL:       "PASTE_YOUR_DATABASE_URL",
  projectId:         "PASTE_YOUR_PROJECT_ID",
  storageBucket:     "PASTE_YOUR_STORAGE_BUCKET",
  messagingSenderId: "PASTE_YOUR_MESSAGING_SENDER_ID",
  appId:             "PASTE_YOUR_APP_ID"
};
```

> **Note:** The `databaseURL` is NOT in the config snippet by default.
> Get it from: Realtime Database → copy the URL shown (looks like `https://finance-hub-xxxxx-default-rtdb.asia-southeast1.firebasedatabase.app`)

### 2e. Set database rules (after testing)
In Firebase Console → Realtime Database → **Rules**, replace with:

```json
{
  "rules": {
    "finance-hub": {
      ".read": true,
      ".write": true
    }
  }
}
```

This keeps it simple since the app already has its own PIN login.

---

## Step 2f: Set up the AI Chat (optional)

The Chat tab answers questions about your budget (and can search the web for things like current loan rates) using Claude. It runs through a Firebase Cloud Function so your Anthropic API key is never exposed in the browser.

Requires the Firebase project to be on the **Blaze (pay-as-you-go)** plan — Cloud Functions aren't available on the free Spark plan. At normal household usage this should cost a few cents to a few dollars a year; set a spending cap on your Anthropic account as a safety net.

1. Install the Firebase CLI if you don't have it: `npm install -g firebase-tools`, then `firebase login`.
2. From the repo root: `firebase use finance-hub-27fb1` (or your project ID).
3. Get an API key from [console.anthropic.com](https://console.anthropic.com) and store it as a Cloud Functions secret:
   ```
   firebase functions:secrets:set ANTHROPIC_API_KEY
   ```
4. Install function dependencies and deploy:
   ```
   cd functions && npm install && cd ..
   firebase deploy --only functions
   ```
5. Reload the app — a "💬 Chat" tab appears for both Elly and Eric.

The function only responds to signed-in requests from the two authorised Google accounts (checked server-side, independent of the client), and caps each account to 30 messages/day to guard against runaway cost from a bug or a spammed link. Chat history isn't saved — it resets on page reload.

---

## Step 3: Deploy to GitHub Pages (free hosting)

### 3a. Create a GitHub account (if you don't have one)
Go to https://github.com and sign up.

### 3b. Create a repository
1. Click **New repository**
2. Name: `finance-hub`
3. Set to **Private** (only you can see the code)
4. Click **Create repository**

### 3c. Upload the file
1. In the new repo, click **uploading an existing file**
2. Drag `index.html` onto the page → **Commit changes**

### 3d. Enable GitHub Pages
1. Go to repo **Settings** → **Pages**
2. Source: **Deploy from a branch**
3. Branch: `main` / `(root)` → **Save**
4. Wait ~60 seconds, then your app is live at:
   `https://YOUR-GITHUB-USERNAME.github.io/finance-hub/`

Share that URL with Eric — he can bookmark it or add it to his phone's home screen.

---

## How the app works

### Elly (Admin)
- Logs in with name **Elly** + her PIN
- Sees all tabs: Monthly View, Summary, Insights, Payables
- Can edit bills, add expenses, manage payables
- Has an **Admin Controls** panel on the Monthly tab with a toggle:
  **"Eric can view budget & ledger"** — off by default

### Eric (Member)
- Logs in with name **Eric** + his PIN
- By default, only sees the **Payables** tab
- When Elly enables the toggle, Eric also sees Monthly View, Summary, and Insights
- Eric can tick off his own payable items; data syncs instantly

### Real-time sync
- Both users see the same live data via Firebase
- A green dot in the top bar shows "Live sync" when connected
- Falls back to localStorage if offline

---

## Troubleshooting

**"Connecting to sync server…" never turns green**
→ Firebase config is missing or incorrect. Double-check `databaseURL` is included.

**Changes don't show up on other device**
→ Make sure both devices are online. The sync dot should be green.

**Login not working**
→ Names are case-insensitive (`elly`, `Elly`, `ELLY` all work). Check your PIN.
