# AutoDev   
**An AI-powered autonomous code editor that turns ideas into running applications — directly in the browser.**

---

##  Overview

**AutoDev** is a next-generation AI code editor inspired by tools like Cursor, designed to **generate, modify, and run full applications from plain English prompts**.

Unlike traditional editors, AutoDev:
- Creates complete project structures in real time  
- Runs applications *inside the editor* using in-browser containers  
- Uses AI agents to autonomously create and edit files  
- Integrates directly with GitHub for repo creation and pushes  

AutoDev is built with **hackathon-grade speed** and **production-grade architecture principles**, leveraging modern cloud, AI, and browser technologies.

---

##  Problem Statement

Modern developers spend significant time on:
- Bootstrapping projects  
- Switching between editor, browser, terminal, and docs  
- Copy-pasting code from documentation  
- Managing repetitive setup tasks  

**AutoDev solves this** by acting as an **autonomous AI developer** that:
- Understands intent  
- Generates structured codebases  
- Executes apps instantly  
- Iterates through natural language commands  

---

##  Core Concept

> **Prompt → Project → Preview → Iterate → Push**

AutoDev enables developers to describe what they want to build, watch the project materialize in real time, run it instantly, and refine it using AI — all within one interface.

---

##  System Architecture

###  High-Level Architecture

```

Client (Browser)
│
├─ CodeMirror 6 (Editor UI)
│   ├─ File Tree
│   ├─ Ghost Text AI Suggestions
│   └─ Chat / Command Interface
│
├─ WebContainers
│   ├─ Node.js Runtime
│   ├─ Dev Server
│   └─ Live Preview + Console
│
└─ AutoDev Backend (Next.js / API Layer)
├─ Convex (Realtime Database)
├─ Clerk (Authentication)
├─ Inngest (AI Agents & Background Jobs)
├─ Dockerized Crawler Service (Crawl4AI)
└─ GitHub Integration

```

---

##  Technology Stack

###  Frontend
- **Next.js + TypeScript**  
  Foundation for UI, API routes, and app routing

- **CodeMirror 6**  
  Advanced in-browser editor with:
  - Syntax highlighting  
  - Code folding  
  - Minimap  
  - Custom ghost-text AI suggestions  

- **WebContainers**  
  Full Node.js environment running **entirely in the browser**:
  - In-editor dev server  
  - Live preview  
  - Console logs  

---

###  Authentication
- **Clerk**
  - Secure OAuth authentication
  - GitHub sign-in support
  - Session management

---

###  Database & Realtime Sync
- **Convex**
  - Realtime database and sync engine
  - No polling, instant updates
  - Stores:
    - Project metadata
    - File trees
    - Editor state
    - AI execution logs

---

###  AI & Background Processing
- **Inngest**
  - Orchestrates AI agents
  - Handles:
    - Long-running AI tasks
    - File creation & modification
    - Retry logic and failure handling
  - Runs asynchronously without blocking the UI
  - Uses free tier for hackathon use

---

###  Web Crawling & Context Ingestion
- **Crawl4AI (Dockerized)**
  - Open-source web crawler
  - Runs as a **separate Docker service**
  - Exposes REST APIs consumed by AutoDev backend
  - Used for:
    - Scraping documentation URLs
    - Reading GitHub READMEs
    - Feeding clean, structured context to AI agents

---

###  Code Execution
- **WebContainers**
  - Runs Node.js projects fully inside the browser
  - Enables:
    - Instant app execution
    - Live reload on file changes
    - Zero local setup for users

---

###  GitHub Integration
- GitHub OAuth (via Clerk)
- Features:
  - Clone existing repositories
  - Create new repositories
  - Push generated projects directly to GitHub
- Large operations handled asynchronously via Inngest

---

##  Key Features

###  AI-Driven Project Generation
- Describe your app in plain English
- AutoDev:
  - Creates folder structure
  - Generates files
  - Writes initial code
- Updates appear **in real time** in the editor

---

###  Autonomous File Editing Agent
- AI can:
  - Create new files
  - Modify existing code
  - Refactor structures
- All changes are:
  - Visible instantly
  - Logged and traceable

---

###  Live In-Editor Preview
- Applications run directly inside AutoDev
- No tab switching
- Full access to:
  - Dev server output
  - Console logs
  - Hot reload

---

###  Ghost Text AI Suggestions
- Context-aware inline suggestions
- Appear as faded “ghost text”
- Press **Tab** to accept
- Trained on:
  - Current file
  - Project structure
  - User intent

---

###  Documentation & URL Ingestion
- Paste any documentation URL
- Crawl4AI:
  - Scrapes and cleans content
  - Converts to LLM-friendly format
- AI uses this context for accurate code generation

---

###  GitHub Export
- One-click push to GitHub
- Supports:
  - New repositories
  - Existing repos
- Ideal for:
  - Hackathon submissions
  - Rapid prototyping
  - Sharing work instantly

---

##  Execution Flow

1. User logs in via GitHub (Clerk)
2. User describes the project
3. AI agent (Inngest) generates files
4. Convex syncs file tree in real time
5. WebContainer boots dev server
6. User edits code with AI suggestions
7. Optional: ingest docs via Crawl4AI
8. User exports project to GitHub

---

##  Security & Reliability
- OAuth-based authentication
- Tokens stored securely
- Background jobs isolated from UI
- Dockerized crawler for sandboxed scraping

---

##  Why AutoDev?

-  Zero setup
-  Autonomous AI agents
-  Modular architecture
-  Runs entirely in the browser
-  Open-source-first mindset

---

##  Future Enhancements
- Collaborative editing
- Multi-agent workflows
- Versioned AI changes
- Plugin ecosystem
- Deployment integrations (Vercel, Netlify)

---

##  Conclusion

**AutoDev** reimagines the developer experience by collapsing idea, code, execution, and iteration into a single intelligent interface.

> *From prompt to production — without leaving the editor.*

---
