Build a multi-page Node.js web application called “Clown Quiz”.
Use a minimalistic, clean UI (light background, simple typography, clear spacing, no flashy colors or heavy gradients). The app should NOT be a single page app: use multiple pages/routes with a shared header/navigation layout.

1. Tech & Structure

Use Node.js with Express (or a similar framework) for the backend.

Use server-side rendering (e.g. EJS/Handlebars/Pug) or a simple frontend framework, but the result must be clearly multi-page:

Each core feature should have its own URL route and page.

Store persistent data in a database (e.g. SQLite, PostgreSQL, MongoDB):

Users (with roles)

Quiz questions and answers

Quiz attempts and leaderboard scores

Chat messages

System messages/inbox items

Archived scoreboards after quiz edits

Implement sessions / cookies for login persistence.

2. Pages & Navigation

Create a consistent top navigation bar with links to:

Home (/)

Register / Login (/auth)

Dashboard / Main Menu (/dashboard) – only for logged-in users

Quiz (/quiz)

Leaderboard (/leaderboard)

Chat (/chat)

Messages / Inbox (/messages)

Admin Panel (/admin) – admins and owner only

Use a simple, consistent layout:

Header with app title and nav.

Main content area centered with cards/sections.

Footer with small text (e.g. version, credits).

3. Authentication & Profiles

Registration & Login Flow

On first visit to the app, show the Home page with a “Register” and “Login” button.

Clicking either goes to the Auth page with tabs or separate forms for:

Register

Login

Register:

Required fields:

Name

Password

Optional:

Upload a profile picture (stored and shown in profile, chat, and leaderboard).

On successful registration:

Automatically log the user in.

Redirect them to the Dashboard.

Create a system message in their inbox welcoming them (see Messages section).

Login:

Login via name + password.

On successful login redirect to Dashboard.

Profile:

In the Dashboard, show:

Username

Role (User/Admin/Owner) with badges

Profile picture

Allow user to update:

Password

Profile picture

4. Dashboard / Main Menu

The Dashboard (main menu) page should be the central hub after login.

It should show:

A welcome message:
“Welcome back, [name]” with their avatar.

Buttons/cards to:

Start Quiz

View Leaderboard

Open Chat

Open Messages

Go to Admin Panel (if admin or owner)

If there is an active announcement from the Owner, show it as a dismissible banner at the top.

5. Quiz Flow (Clown Quiz)

Quiz Page (/quiz):

Use a clean, centered card layout.

The quiz is about clowns.

By default, there are 10 questions:

Display one question per screen (“Question 1/10” etc.).

Each question can be multiple choice or short answer (your choice, but be consistent).

Navigation during quiz:

“Next” button to proceed.

Optionally “Previous” to go back (if you want).

Show a minimal progress indicator (e.g. step dots or percentage).

On Quiz Completion:

Show the score summary:

Number of correct answers

Percentage score

Ask: “Do you want to add your score to the leaderboard?”

If Yes:

Save the score (with timestamp, username, and maybe profile picture).

Redirect to Leaderboard page.

If No:

Redirect back to Dashboard.

6. Leaderboard

Leaderboard Page (/leaderboard):

Show a ranked list of users by their best score or latest score (choose one and be consistent).

Each entry should show:

Position (1st, 2nd, 3rd…)

Name

Profile picture (if available)

Score

Date of that score

If the quiz has been edited at some point:

Old scores for the previous quiz version are archived:

Show a link or dropdown:

“Current Leaderboard”

“Archived Leaderboards”

Archived leaderboards show scores from before the last quiz edit, labeled by version or date.

7. Chat

Chat Page (/chat):

Simple real-time or periodically refreshed chat room that all logged-in users can see.

Message display:

Profile picture

Username

Role badge:

Admin messages have an “Admin” badge.

Owner messages have an “Owner” badge.

New message input at bottom:

Single line input and a “Send” button.

Roles in Chat:

Admins and owner can moderate:

Delete messages

Mute or ban users (design simple moderation actions and surfaces).

When a moderation action is taken:

The moderated user receives an appropriate system message in their inbox (see Messages section).

8. Messages / Inbox

Messages Page (/messages):

Think of this as a simple in-app inbox for more formal notifications.

Messages come from a special “System” account (non-reply, users cannot respond).

Message types:

Welcome message on registration

Sent automatically to a new user.

Content example:

Welcome to Clown Quiz

Brief tips about how to use quiz, chat, and leaderboard.

Moderation notice

When an admin/owner moderates a user (mute/ban/etc.), system sends a message to that user.

Contains:

What action was taken

Who performed it (name and role)

Optional reason.

Admin role change

When a user is appointed as admin:

System message saying they were made admin.

Who promoted them.

A friendly welcome as staff.

When a user is removed as admin:

System message saying they were removed.

Who removed them.

A short goodbye/thanks for service.

Messages UI:

List of messages on the left (or top) with:

Title

Type/label icon (Welcome, Moderation, Role Change).

Date.

Clicking a message shows full content on the right (or below).

Messages are read-only.

9. Admin Panel

Admin Panel Page (/admin) – Admins and Owner only

Sections:

User Management

List of users:

Name

Profile picture

Role (User/Admin/Owner)

Account status (active, muted, banned)

Actions for admins:

Mute/unmute user

Ban/unban user

Actions for owner:

All of the above

Promote/demote admins (see Owner powers below)

Moderate admin accounts.

Quiz Editor

Interface to edit the clown quiz:

List current questions and answers.

Add new questions.

Edit existing questions and correct answers.

Remove questions.

On submission of changes:

All users now see the new version of the quiz.

The existing leaderboard is archived (move current scores to archived leaderboard).

Show a warning like:

“Editing the quiz will archive the current leaderboard.”

Announcements (Owner only)

Owner can compose announcements:

Text content.

Choose type: general announcement or staff announcement.

When submitted:

The announcement appears on everyone’s screen as an overlay/banner:

For a number of seconds based on length (e.g. short messages ~3 seconds, longer messages longer).

Dismissible or auto-disappearing.

10. Roles & Permissions

Define three roles:

User

Can:

Register, login, and log out.

Edit own profile (password, picture).

Take quizzes.

Submit scores to leaderboard.

Use chat.

Read system messages.

Cannot:

Access admin panel.

Edit quiz.

Moderate anyone.

Admin

Has all user permissions, and can additionally:

Access admin panel.

Moderate regular users (mute, ban, etc.) – not other admins or owner.

Edit quiz questions and correct answers (quiz editor).

Their messages in chat have an “Admin” tag.

Cannot:

Promote others to admin.

Demote other admins.

Moderate the owner.

Owner

Special high-rank account (see below).

Has all admin permissions, plus:

Moderate admin accounts.

Promote regular users to admin.

Demote admins back to users.

Make global announcements and staff announcements.

Their messages in chat have an “Owner” badge or tag.

11. Pre-Made Owner Account

Create one pre-made account in the database:

Username: Easmox

Password: 732800

Role: Owner (highest rank)

This account:

Has an “Owner” badge displayed in profile, chat, and admin screens.

Can moderate admin accounts.

Can appoint new admins and remove admin privileges.

Can create announcements (global and staff).

12. UI / UX Style

Overall style: very minimalistic.

Neutral color palette (whites, light grays, one accent color).

Flat, simple buttons and cards.

Clear, readable font.

Use:

Cards for quiz questions and list items.

Simple pill/badge components for roles (User/Admin/Owner).

Subtle separators between sections.

Avoid:

Heavy gradients, animations, or overly “clowny” visuals.

Responsiveness:

Layout should work on desktop and be usable on tablet/mobile (no need for perfection, just basic responsiveness).
