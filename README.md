This is the **Bill Helper** app, built with [Next.js](https://nextjs.org).

It runs completely in the browser + a small Node server and does **not** use any database. Bills and notes stay on the device, except for the text that is sent to the AI provider to do the analysis.

---

## Install and run on a Windows PC (for your dad)

These steps assume your dad's computer is Windows 10 or 11.

### 1. Install required software (one‑time)

1. Install **Node.js LTS** from https://nodejs.org (choose the LTS/Recommended version, run the installer, accept defaults).
2. Install **Git for Windows** from https://git-scm.com/download/win (accept the defaults).
3. Restart the computer (optional, but helps ensure `node`, `npm`, and `git` are on the PATH).

### 2. Get this project from GitHub

1. On your Mac, push this folder to a private GitHub repo (for example `bill-helper`).
2. On your dad's PC:
	- Press `Win` key, type **Command Prompt** and open it.
	- Choose a folder to keep the project, for example `C:\Users\Dad\Documents`:

	```bash
	cd %USERPROFILE%\Documents
	git clone https://github.com/YOUR-GITHUB-USERNAME/bill-helper.git
	cd bill-helper
	```

Replace `YOUR-GITHUB-USERNAME` and the repo name with your actual values.

### 3. Add the secret settings (`.env.local`)

> Important: Do **not** commit this file to GitHub. It should stay on each computer only.

1. In the cloned `bill-helper` folder, create a file named `.env.local`.
2. Put your API settings in it (the same values you use on your Mac), for example:

	```env
	GITHUB_MODELS_ENDPOINT=https://models.inference.ai.azure.com
	GITHUB_MODELS_API_KEY=YOUR_GITHUB_MODELS_PAT
	GITHUB_MODELS_MODEL_ID=gpt-4o-mini
	```

3. Save the file.

This file is already ignored by `.gitignore`, so it will **not** be uploaded to GitHub.

### 4. Install dependencies

From the same Command Prompt window, inside the `bill-helper` folder:

```bash
npm install
```

This can take a few minutes the first time.

### 5. Run the app

Still in the `bill-helper` folder:

```bash
npm run dev
```

Wait until you see a message like `ready - started server on http://localhost:3000`.

Then open a browser (Edge or Chrome) and go to:

- http://localhost:3000

That’s the Bill Helper app. Leave the Command Prompt window open while he is using it; closing it stops the app.

### 6. Stopping and starting later

- To stop the app: click in the Command Prompt window and press `Ctrl + C`.
- To start it again another day:

  ```bash
  cd %USERPROFILE%\Documents\bill-helper
  npm run dev
  ```

Then open http://localhost:3000 in the browser again.

---

## For contributors

If someone else wants to run or improve this app:

1. Clone the repo:

	```bash
	git clone https://github.com/YOUR-GITHUB-USERNAME/bill-helper.git
	cd bill-helper
	```

2. Create a local env file by copying the example:

	```bash
	cp .env.example .env.local
	```

3. Edit `.env.local` and put in **their own** API key and endpoint values.
4. Install dependencies and run the dev server:

	```bash
	npm install
	npm run dev
	```

5. Open http://localhost:3000.

The `.env.local` file is ignored by git, so contributors cannot accidentally commit their secrets.

---

## Security notes (for sharing and using on other computers)

- The GitHub repo contains **only code**, not bills or secrets.
- The `.env.local` file on each machine holds the private API key and is **never** committed.
- Bill text and notes are kept only in the browser and the local browser storage on that device.
- The only external party that sees bill text is the AI provider (GitHub Models / OpenAI‑compatible endpoint) when performing analysis.

This means you can:

- Safely host the code on GitHub.
- Clone it onto another trusted computer (like your dad's) and run it there.
- Delete the folder on any computer later to remove the local copy of the app and its browser‑stored history.
