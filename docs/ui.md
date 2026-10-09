Design a complete, polished UI/UX system for an open-source developer education platform called **GitDojo**.

GitDojo is an interactive Git learning platform where users learn Git by typing commands into a safe browser terminal, manipulating a virtual repository, visualizing Git state, completing guided lessons, and solving real-world Git challenges.

The product should feel like a blend of:

**GitHub + VS Code + Linear + modern developer tooling + subtle gamification**

It must NOT feel childish, overly gamified, cartoonish, or like a generic online course platform.

The overall product should feel:

- technical
- premium
- clean
- developer-focused
- fast
- modern
- dark-first
- trustworthy
- open-source friendly
- slightly futuristic
- educational without looking academic

The core brand idea is:

**Learn Git by doing.**

Secondary tagline:

**Learn it. Break it. Fix it. Master it.**

Alternative brand message:

**The safest place to break Git.**

---

# 1. BRAND NAME

Use:

# GitDojo

Logo concept:

Create a simple geometric developer-oriented logo.

Possible concepts:

- Git branch symbol integrated into a circular dojo mark
- stylized branching commit graph
- `>` terminal cursor combined with Git nodes
- minimal hexagonal Git graph symbol
- abstract `G` built from connected commit nodes

Do not use:

- literal ninja cartoons
- samurai mascots
- overly playful dojo imagery
- generic graduation caps
- overly detailed logos

The logo should work at:

- 16×16 favicon
- navbar
- GitHub profile
- mobile app icon
- documentation header

---

# 2. DESIGN STYLE

Use a dark-first design system inspired by modern developer products.

References in spirit:

- GitHub
- VS Code
- Linear
- Vercel
- Raycast
- Warp
- Railway
- Resend

Do not directly copy any brand.

The interface should use:

- deep neutral background
- slightly lighter panels
- thin borders
- subtle shadows
- minimal gradients
- restrained accent colors
- strong typography hierarchy
- monospace only where technically appropriate

Avoid:

- glassmorphism everywhere
- neon cyberpunk appearance
- excessive blur
- giant gradients
- oversized rounded corners
- brightly colored dashboard cards
- unnecessary illustrations

---

# 3. COLOR SYSTEM

Create the design primarily around a dark neutral palette.

## Core background colors

Primary app background:

```text
#0B0D10
```

Secondary app surface:

```text
#111419
```

Panel/card surface:

```text
#151920
```

Elevated surface:

```text
#1A1F27
```

Hover surface:

```text
#202630
```

Deep terminal background:

```text
#080A0D
```

---

# 4. BORDER COLORS

Default border:

```text
#262C35
```

Subtle border:

```text
#1D222A
```

Strong border:

```text
#343C48
```

Focused border:

```text
#6C8CFF
```

Borders should generally be 1px.

Avoid heavy shadows unless needed for overlays.

---

# 5. PRIMARY ACCENT COLOR

Use a refined electric blue / indigo accent.

Primary:

```text
#6C8CFF
```

Hover:

```text
#7C9AFF
```

Active:

```text
#5877F2
```

Soft background:

```text
rgba(108, 140, 255, 0.12)
```

Soft border:

```text
rgba(108, 140, 255, 0.30)
```

The blue accent is used for:

- primary buttons
- focused terminal/input
- active lesson
- active navigation
- HEAD indicators
- progress
- selected tabs
- links

Do not use blue everywhere.

---

# 6. SECONDARY ACCENT

Use subtle Git-inspired orange as a secondary highlight.

Secondary orange:

```text
#F59E5B
```

Soft orange:

```text
rgba(245, 158, 91, 0.12)
```

Use only for:

- Git branch highlights
- warnings
- branch visualization
- specific status tags

Do not make orange the primary brand color.

---

# 7. SEMANTIC COLORS

Success:

```text
#4FD18B
```

Success background:

```text
rgba(79, 209, 139, 0.12)
```

Warning:

```text
#F5C451
```

Warning background:

```text
rgba(245, 196, 81, 0.12)
```

Danger:

```text
#F06A78
```

Danger background:

```text
rgba(240, 106, 120, 0.12)
```

Info:

```text
#62B6FF
```

Purple:

```text
#A78BFA
```

Purple can be used selectively for advanced Git concepts like rebase/cherry-pick.

---

# 8. TEXT COLORS

Primary text:

```text
#F4F7FB
```

Secondary text:

```text
#AEB6C2
```

Muted text:

```text
#7C8593
```

Very muted:

```text
#5F6875
```

Disabled:

```text
#49515C
```

Never use pure white everywhere.

---

# 9. LIGHT MODE

Design light mode too, but prioritize dark mode.

Light background:

```text
#F7F8FA
```

Panel:

```text
#FFFFFF
```

Secondary surface:

```text
#F0F2F5
```

Border:

```text
#DDE1E7
```

Primary text:

```text
#15181D
```

Secondary text:

```text
#606975
```

Keep the same accent blue.

---

# 10. TYPOGRAPHY

Use two font families.

## Main UI font

Preferred:

**Inter**

Alternatives:

- Geist Sans
- SF Pro
- IBM Plex Sans

Use Inter if possible.

Typography should feel modern and technical.

---

# 11. MONOSPACE FONT

Use:

**JetBrains Mono**

Alternatives:

- Geist Mono
- IBM Plex Mono
- Fira Code

Use monospace for:

- terminal
- commands
- file names
- commit SHAs
- Git branches
- code editor
- command reference
- system output

Do NOT use monospace for full body text.

---

# 12. TYPE SCALE

Use:

Display Hero:

```text
56px / 64px
font-weight: 700
letter-spacing: -0.03em
```

Desktop H1:

```text
40px / 48px
font-weight: 700
```

H2:

```text
30px / 38px
font-weight: 650
```

H3:

```text
22px / 30px
font-weight: 600
```

H4:

```text
18px / 26px
font-weight: 600
```

Body large:

```text
17px / 28px
```

Body:

```text
15px / 24px
```

Small:

```text
13px / 20px
```

Caption:

```text
12px / 18px
```

Terminal text:

```text
13px–14px
JetBrains Mono
```

---

# 13. BORDER RADIUS

Keep the system mature and restrained.

Small:

```text
6px
```

Default:

```text
8px
```

Card:

```text
10px
```

Large modal:

```text
12px
```

Avoid 20px+ rounded SaaS cards.

---

# 14. SPACING SYSTEM

Use a 4px base grid.

Examples:

```text
4
8
12
16
20
24
32
40
48
64
80
96
```

Panels should have:

```text
16px–24px internal padding
```

Main content max width:

```text
1280px–1440px
```

Learning workspace may use full width.

---

# 15. ICONOGRAPHY

Use:

**Lucide Icons**

Style:

- 16px or 18px normally
- 20px for larger actions
- stroke 1.5–2
- minimal
- no colored icon backgrounds unless necessary

Recommended icons:

- Terminal
- GitBranch
- GitCommit
- GitMerge
- File
- Folder
- CheckCircle
- Circle
- Lightbulb
- RotateCcw
- Settings
- Play
- Trophy
- BookOpen
- Github
- Search
- Command
- Code2
- PanelLeft
- Maximize2

---

# 16. NAVBAR

Desktop navbar:

```text
┌──────────────────────────────────────────────────────────────┐
│ GitDojo   Learn   Playground   Challenges   Commands   Docs │
│                                              GitHub   Sign in │
└──────────────────────────────────────────────────────────────┘
```

Height:

```text
56px–64px
```

Background:

```text
#0B0D10
```

with subtle bottom border.

Sticky.

GitDojo logo on left.

Navigation:

- Learn
- Playground
- Challenges
- Commands
- Docs

Right:

- GitHub star/repo button
- theme toggle
- profile / sign-in

Active nav should use:

- primary text
- subtle blue underline or soft background

Avoid oversized pill navigation.

---

# 17. LANDING PAGE

Create a premium landing page.

Hero layout:

Left:

```text
Learn Git by doing.

Type real Git commands.
See what happens.
Break repositories safely.
Learn how to fix them.

[Start Learning]
[Open Playground]
```

Right:

Interactive fake terminal + repository graph.

Example terminal:

```text
$ git status

On branch main

Untracked files:
  README.md

$ git add README.md
```

Beside it visually show README moving into staging.

Hero background should be dark with a subtle radial glow.

No giant abstract illustrations.

---

# 18. HERO DETAILS

Hero heading:

```text
Learn Git by doing.
```

Highlight:

```text
by doing
```

with blue.

Subheading:

```text
An interactive Git learning environment where you type real commands, visualize repository state, and learn how Git actually works.
```

Primary CTA:

```text
Start Learning
```

Secondary:

```text
Open Playground
```

Small trust line:

```text
Open source • Runs safely in your browser
```

---

# 19. HOMEPAGE FEATURE SECTIONS

Create sections:

1. How GitDojo works

```text
Learn
→
Type
→
Visualize
→
Fix
```

2. Interactive terminal

3. Visualize Git internally

4. Real Git challenges

5. Safe playground

6. Open source contribution

7. CTA

---

# 20. LEARNING DASHBOARD

Route:

```text
/learn
```

Layout:

Header:

```text
Learn Git
Master the fundamentals, then tackle real-world Git workflows.
```

Left sidebar optional:

```text
Learning Paths
Git Basics
Working with Files
Branching
Merging
Conflicts
Remotes
Undoing Mistakes
Advanced Git
```

Main content:

Course cards.

Course card:

```text
Git Basics

8 lessons
Beginner

Learn repositories, staging and commits.

██████████░░ 70%

[Continue]
```

Course card styling:

Background:

```text
#151920
```

Border:

```text
#262C35
```

Hover:

- slightly brighter border
- 1–2px translateY
- no dramatic shadow

---

# 21. MAIN LEARNING WORKSPACE

This is the most important screen.

Route:

```text
/learn/[course]/[lesson]
```

Desktop layout:

```text
┌─────────────────────────────────────────────────────────────────────┐
│ Topbar                                                              │
├─────────────────┬─────────────────────────┬─────────────────────────┤
│ Lesson Panel    │ Terminal                │ Repository Graph        │
│                 │                         │                         │
│ Lesson title    │ learner@gitdojo $       │ main                    │
│ Explanation     │                         │  ↓                      │
│                 │                         │  ●                      │
│ Objectives      │                         │                         │
│                 │                         │                         │
│ Hints           │                         │                         │
├─────────────────┴─────────────────────────┴─────────────────────────┤
│ Working Tree      │ Staging Area      │ Repository                │
└─────────────────────────────────────────────────────────────────────┘
```

Desktop width distribution:

```text
Lesson Panel      26%
Terminal          44%
Repository Graph  30%
```

Bottom area:

```text
33% / 33% / 33%
```

Allow draggable/resizable panels later.

---

# 22. LEARNING TOPBAR

Topbar contents:

Left:

```text
← Git Basics
Lesson 4 of 8
Your First Commit
```

Center optional:

```text
Progress ███████░░
```

Right:

```text
Reset
Help
Settings
```

Reset should require confirmation only if meaningful work exists.

---

# 23. LESSON PANEL

Panel background:

```text
#111419
```

Lesson title:

```text
Your First Commit
```

Lesson body should be readable, not overly dense.

Show:

```text
Goal

Create your first Git commit.
```

Then short concept explanation.

Then objectives:

```text
Objectives

✓ Initialize the repository
✓ Stage README.md
○ Create your first commit
```

Completed objectives:

- green check
- muted text

Current objective:

- blue accent
- slight soft background

Future objectives:

- muted

---

# 24. HINT SYSTEM UI

Hint area:

```text
Need help?

[Reveal Hint]
```

On reveal:

```text
Hint 1 of 3

Git does not yet know that this directory should be tracked.
```

Controls:

```text
[Next Hint]
```

The third hint may show:

```text
git init
```

in monospace block.

Hints should never dominate the panel.

---

# 25. TERMINAL UI

This is a primary visual focus.

Background:

```text
#080A0D
```

Text:

```text
#D6DCE5
```

Prompt username:

```text
#4FD18B
```

Path:

```text
#62B6FF
```

Command:

```text
#F4F7FB
```

Warnings:

```text
#F5C451
```

Errors:

```text
#F06A78
```

Terminal font:

```text
JetBrains Mono
13px–14px
```

Header:

```text
Terminal
```

Actions:

- clear
- copy output
- maximize

Terminal example:

```text
learner@gitdojo ~/project $ git status

On branch main

No commits yet

Untracked files:
  README.md

learner@gitdojo ~/project $
```

Cursor:

- subtle blue/white block
- blinking

---

# 26. TERMINAL HEADER

Header should resemble developer tool panels.

Example:

```text
● ● ●     Terminal                       Clear   ⛶
```

But don't copy Mac dots if unnecessary.

Better:

```text
Terminal
bash-like Git sandbox             Clear   ⛶
```

Small secondary text:

```text
Safe browser environment
```

---

# 27. FILE EXPLORER

Optional tab inside learning workspace.

VS Code-inspired but simpler.

Example:

```text
PROJECT

▼ src
    index.ts
    auth.ts

README.md
.gitignore
package.json
```

Git badges:

```text
M
A
D
U
```

Use semantic colors sparingly.

Selected file:

```text
rgba(108, 140, 255, 0.10)
```

---

# 28. CODE EDITOR

Use Monaco styling that matches GitDojo.

Tabs:

```text
README.md     ×
```

Editor background:

```text
#0D1014
```

Line numbers muted.

Active line subtle.

No giant borders.

---

# 29. WORKING TREE / STAGING / REPOSITORY PANEL

Create three equally important cards.

### Working Tree

Header:

```text
Working Tree
```

Description:

```text
Files changed locally
```

Example:

```text
README.md        Untracked
auth.ts          Modified
```

### Staging Area

```text
Staging Area
Files prepared for the next commit
```

### Repository

```text
Repository
Committed history
```

Use small status chips.

Example chip:

```text
UNTRACKED
```

should be subtle, not bright badge spam.

---

# 30. FILE MOVEMENT ANIMATIONS

When running:

```text
git add README.md
```

animate README.md from:

```text
Working Tree → Staging Area
```

Duration:

```text
250–400ms
```

Use subtle movement and opacity.

When committing:

```text
Staging Area → Repository
```

Then create commit node.

Keep animations informative, not flashy.

---

# 31. GIT GRAPH

Use a vertical graph.

Background:

same panel background.

Commit node:

```text
12px–14px circle
```

Current HEAD:

blue.

Regular commit:

neutral.

Merge commit:

orange/purple accent if needed.

Example:

```text
main
 ↓
● 8a21c4d Add README
│
● 1f9d220 Initial commit
```

Commit card on selection:

```text
8a21c4d

Add README

GitDojo Learner
2 minutes ago
```

Branch labels should be compact rounded labels.

---

# 32. COMMIT DETAILS DRAWER

Clicking commit opens a right-side drawer or popover.

Show:

```text
Commit

8a21c4d2...

Message
Add README

Author
GitDojo Learner

Parent
1f9d220

Files changed
README.md
```

Use monospace for hash.

---

# 33. LESSON COMPLETION

When user finishes:

Do not use a giant confetti animation by default.

Use a tasteful modal/card:

```text
Lesson Complete

Your First Commit

You learned:
git init
git status
git add
git commit

+100 XP

[Next Lesson]
[Try in Playground]
```

Subtle success glow okay.

Optional tiny particle effect only.

---

# 34. PLAYGROUND PAGE

Route:

```text
/playground
```

Full-width developer environment.

Layout:

```text
┌──────────────────────────────────────────────────────────────┐
│ Playground        New Repo   Reset   Import Scenario        │
├───────────────┬──────────────────────────┬───────────────────┤
│ Files         │ Terminal / Editor        │ Git Graph         │
│               │                          │                   │
├───────────────┴──────────────────────────┴───────────────────┤
│ Working Tree      Staging Area         Repository           │
└──────────────────────────────────────────────────────────────┘
```

Tabs in center:

```text
Terminal | Editor
```

Playground should feel slightly more powerful than lessons.

---

# 35. CHALLENGES PAGE

Route:

```text
/challenges
```

Header:

```text
Git Challenges

Practice real developer situations without risking a real repository.
```

Filters:

```text
All
Beginner
Intermediate
Advanced
Recovery
Branching
Conflicts
```

Challenge card:

```text
Production Disaster #04

You committed on the wrong branch.

Difficulty: Intermediate
Commands involved: branch, reset

[Start Challenge]
```

Do not reveal exact solution commands on cards.

---

# 36. CHALLENGE DETAIL

Challenge screen looks like the learning workspace but removes guided instructions.

Left panel:

```text
Mission

You committed directly to main.

Move the commit to a feature branch
and restore main to its previous state.

Success Conditions

○ feature/login exists
○ commit exists on feature/login
○ main restored
```

No hints by default.

Optional:

```text
Need a hint?
```

---

# 37. COMMAND REFERENCE PAGE

Route:

```text
/commands
```

Search field:

```text
Search Git commands...
```

Command sidebar:

```text
Setup
git init
git clone

Changes
git add
git commit

Branches
git branch
git switch
git merge

History
git log
git show
```

Command detail:

```text
git reset

Move HEAD and optionally update the staging area and working tree.
```

Examples shown in code blocks.

Add:

```text
Try in Playground
```

button.

---

# 38. COMMAND PAGE VISUAL EXPLANATIONS

For commands like reset, use diagrams.

Example:

```text
git reset --soft

Before

A ─ B ─ C
        ↑ HEAD

After

A ─ B
    ↑ HEAD

C changes remain staged
```

Use line diagrams and compact cards.

---

# 39. DASHBOARD

When user accounts exist later:

```text
/dashboard
```

Top:

```text
Welcome back

Continue where you left off.
```

Cards:

```text
Current Course

Git Basics
7 / 10 lessons
██████████████░░
```

Stats:

```text
Lessons
36

Challenges
18

Commands Mastered
14

Current Streak
6 days
```

Keep stats restrained.

---

# 40. PROFILE PAGE

Example:

```text
Aakash
@aakash

Git Level 12

Lessons       86
Challenges    23
Commands      31
```

Achievements in grid.

Recent activity:

```text
Completed Merge Conflicts
Mastered git stash
Solved Disaster #08
```

---

# 41. SETTINGS

Sections:

```text
Appearance
Terminal
Editor
Learning
Accessibility
Account
```

Appearance:

- Dark
- Light
- System

Terminal:

- font size
- cursor style
- line height

Learning:

- auto hints
- animation speed
- explanation depth

---

# 42. OPEN SOURCE PAGE

Route:

```text
/open-source
```

Headline:

```text
Built in the open.
```

Explain contribution paths:

```text
Write lessons
Build features
Fix bugs
Improve docs
Create challenges
```

CTA:

```text
View on GitHub
Read Contributing Guide
```

Show simple architecture diagram.

---

# 43. DOCS PAGE

Docs layout:

Left sidebar.

Content center.

Right table of contents.

Use main UI typography.

Code blocks dark even in light mode.

Documentation categories:

```text
Getting Started
Architecture
Lesson Authoring
Validators
Git Engine
Contributing
```

---

# 44. BUTTON SYSTEM

Primary:

Background:

```text
#6C8CFF
```

Text:

```text
#FFFFFF
```

Hover:

```text
#7C9AFF
```

Border radius:

```text
8px
```

Height:

```text
36px or 40px
```

Secondary:

```text
transparent / #151920
border #343C48
```

Ghost:

transparent.

Danger:

dark red soft background.

Avoid oversized 48–56px buttons except hero CTA.

---

# 45. INPUTS

Background:

```text
#111419
```

Border:

```text
#2A313C
```

Focused border:

```text
#6C8CFF
```

Focus ring:

```text
rgba(108, 140, 255, 0.20)
```

Height:

```text
38px–42px
```

Placeholder:

```text
#6F7886
```

---

# 46. CHIPS / BADGES

Use compact rectangular badges.

Examples:

```text
BEGINNER
STAGED
UNTRACKED
MAIN
HEAD
```

Height around:

```text
20px–24px
```

Font:

```text
11px–12px
```

Do not make every label a colorful badge.

---

# 47. TOOLTIPS

Dark elevated surface:

```text
#1A1F27
```

Text:

```text
#E6EAF0
```

Small subtle border.

Use for technical concepts.

Example:

Hover `HEAD`:

```text
HEAD points to the commit or branch you currently have checked out.
```

---

# 48. MODALS

Centered modal:

```text
max-width 480px
```

Background:

```text
#151920
```

Border:

```text
#2A313C
```

Use for:

- reset confirmation
- lesson complete
- import scenario
- keyboard shortcuts

---

# 49. KEYBOARD SHORTCUT UI

Add command palette later.

Shortcut style:

```text
⌘ K
```

Small bordered keycap.

Potential shortcuts:

```text
⌘ K       Command palette
⌘ Enter   Run command
⌘ /       Hint
⌘ R       Reset lesson
```

Do not conflict with browser shortcuts unnecessarily.

---

# 50. EMPTY STATES

Example staging:

```text
No staged changes

Use git add to prepare files for your next commit.
```

Include tiny icon.

Avoid huge empty-state illustrations.

---

# 51. LOADING STATES

Use subtle skeletons.

Never block entire page for minor operations.

Terminal actions should feel immediate.

Git state update indicator:

```text
Updating repository...
```

only when necessary.

---

# 52. ERROR STATES

Example:

```text
Something went wrong loading this lesson.

[Retry]
```

Technical details hidden behind:

```text
Show details
```

Terminal errors remain terminal-like.

---

# 53. RESPONSIVE DESIGN

Desktop:
full 3-panel layout.

Tablet:
two columns.

Example:

```text
Lesson | Terminal
Repository Graph below
```

Mobile:
tabs:

```text
Lesson
Terminal
Graph
Files
```

Bottom navigation okay for learning views.

Terminal must still be usable.

---

# 54. ACCESSIBILITY

Meet WCAG AA.

Requirements:

- keyboard navigation
- visible focus states
- sufficient contrast
- aria labels
- terminal accessible labels
- never rely only on color for state
- reduced-motion support
- scalable fonts

Status should show icon + text, not only color.

---

# 55. MOTION DESIGN

Keep motion subtle.

Timing:

```text
Fast: 120ms
Standard: 180ms
State change: 250ms
Educational movement: 300–400ms
```

Easing:

```text
ease-out
```

Use movement for:

- file staging
- commit creation
- objective completion
- tab transitions

Do not animate everything.

---

# 56. MICROINTERACTIONS

Good examples:

Running command:

brief prompt activity.

Successful objective:

circle → check animation.

Git add:

file shifts from working tree to staging.

Commit:

new node fades/scales into graph.

Branch change:

branch label smoothly moves HEAD marker.

---

# 57. LANDING PAGE VISUAL DEMO

Create an interactive-looking mockup:

Terminal:

```text
$ git add README.md
```

Working Tree:

```text
README.md
```

animated arrow:

```text
→
```

Staging:

```text
README.md
```

Then:

```text
$ git commit -m "Initial commit"
```

Graph:

```text
main
 ↓
● Initial commit
```

This should immediately communicate what GitDojo does.

---

# 58. DESIGN TOKENS

Define tokens.

Example:

```css
--bg-app: #0b0d10;
--bg-surface: #111419;
--bg-panel: #151920;
--bg-elevated: #1a1f27;

--border-default: #262c35;
--border-strong: #343c48;

--text-primary: #f4f7fb;
--text-secondary: #aeb6c2;
--text-muted: #8a93a1; /* 4.5:1 on every surface (WCAG AA) */

--accent-primary: #6c8cff; /* text, borders, focus */
--accent-strong: #4a67e0; /* filled backgrounds under white text */
--accent-secondary: #f59e5b;

--success: #4fd18b;
--warning: #f5c451;
--danger: #f06a78;

--radius-sm: 6px;
--radius-md: 8px;
--radius-lg: 10px;
```

Build all UI from these tokens.

---

# 59. COMPONENT LIBRARY

Create reusable components:

```text
Button
IconButton
Input
SearchInput
Card
Panel
Tabs
Badge
Tooltip
Popover
Dialog
Drawer
Progress
Dropdown
CommandMenu
Separator
Skeleton
Toast
CodeBlock
TerminalPanel
GitStatusBadge
CommitNode
BranchLabel
ObjectiveItem
HintCard
LessonCard
ChallengeCard
StatCard
```

Use consistent variants.

---

# 60. PANEL COMPONENT

Create a standard Panel:

```text
PanelHeader
PanelTitle
PanelDescription
PanelActions
PanelBody
PanelFooter
```

Use across:

- terminal
- lesson
- graph
- staging
- repository

This keeps layout consistent.

---

# 61. GIT-SPECIFIC VISUAL LANGUAGE

Create a consistent Git language.

Branch:

```text
orange or blue label
GitBranch icon
```

Commit:

```text
round node
GitCommit icon in lists
```

Merge:

```text
orange
GitMerge icon
```

HEAD:

```text
blue HEAD chip
```

Conflict:

```text
danger red
```

Staged:

```text
green
```

Modified:

```text
warning yellow
```

Untracked:

```text
muted blue/gray
```

---

# 62. STATUS COLORS

Recommended mapping:

```text
Untracked
#7C8593

Modified
#F5C451

Staged
#4FD18B

Deleted
#F06A78

Conflict
#F06A78

Committed
#6C8CFF
```

Again: always include text/icon, not color alone.

---

# 63. LESSON CARD VISUAL

Example:

```text
┌──────────────────────────────┐
│ 01                           │
│ Your First Repository        │
│                              │
│ Learn git init and status.   │
│                              │
│ Beginner        10 min       │
│                              │
│ ████████░░ 80%               │
└──────────────────────────────┘
```

Completed cards can show a small green check.

Locked cards should appear muted.

---

# 64. PROGRESS DESIGN

Course progress:

thin line:

```text
4px–6px height
```

Primary blue.

Avoid giant circular progress indicators.

Lesson progress:

```text
4 / 8
```

with subtle segmented line.

---

# 65. GAMIFICATION

Keep subtle.

Use:

- XP
- lesson completion
- achievements
- streaks

Avoid:

- cartoon coins
- loot boxes
- flashy level-ups
- huge confetti
- childish badges

Developer audience should still feel professional.

---

# 66. ACHIEVEMENTS

Achievement cards:

```text
Conflict Resolver
Resolve your first merge conflict.
```

Icon:
GitMerge / CheckCircle.

Unlocked:
normal.

Locked:
muted + small lock.

---

# 67. OPEN-SOURCE IDENTITY

Include GitHub prominently but not excessively.

Navbar button:

```text
★ Star on GitHub
```

Open-source section:

```text
GitDojo is built in the open.

Contribute lessons, challenges,
features, docs, and fixes.
```

Use contribution activity visuals later.

---

# 68. MARKETING COPY STYLE

Voice should be:

- concise
- developer-native
- confident
- clear
- not corporate
- not cheesy

Good:

```text
Stop memorizing Git commands.
Start understanding them.
```

Good:

```text
Break Git here, not in production.
```

Good:

```text
Every command changes the repository.
GitDojo shows you how.
```

Avoid:

```text
Unlock your coding superpowers!
```

Avoid generic EdTech language.

---

# 69. HOME PAGE COPY

Hero:

```text
Learn Git by doing.

Type real Git commands, visualize what changes,
and learn how to recover when things go wrong.
```

Section:

```text
Git makes more sense when you can see it.

Working tree.
Staging area.
Commits.
Branches.
HEAD.

GitDojo makes the invisible parts of Git visible.
```

Challenge section:

```text
Break things safely.

Merge the wrong branch.
Lose a commit.
Enter detached HEAD.
Create a conflict.

Then learn how to recover.
```

---

# 70. FINAL DESIGN DIRECTION

The completed product should feel like a real developer tool first and an educational platform second.

Users should feel comfortable leaving GitDojo open next to VS Code.

The interface should feel appropriate for:

- students
- junior developers
- experienced developers refreshing Git
- university labs
- open-source contributors

The strongest visual identity should come from:

```text
dark technical UI
+
browser terminal
+
Git graph
+
working tree / staging visualization
+
restrained blue accent
```

not from decorative graphics.

---

# 71. REQUIRED SCREENS TO DESIGN

Create desktop designs for:

1. Landing page
2. Learn dashboard
3. Course page
4. Main lesson workspace
5. Lesson completion state
6. Playground
7. Challenge browser
8. Challenge workspace
9. Git commands reference
10. Command detail page
11. Open-source page
12. Documentation page
13. Dashboard
14. User profile
15. Settings
16. Empty/error/loading states

Also create responsive versions for:

- tablet
- mobile

The **main lesson workspace**, **terminal**, **Git graph**, and **working tree / staging / repository visualization** should receive the highest design attention.

---

# 72. COMPONENT STATES

Design each major component in:

```text
Default
Hover
Active
Focused
Disabled
Loading
Error
Success
Empty
```

Especially:

```text
Button
Lesson card
Challenge card
Objective item
Terminal
File
Commit node
Branch label
Input
Tab
```

---

# 73. FIGMA / DESIGN SYSTEM ORGANIZATION

If producing a Figma design, organize pages as:

```text
00 Cover
01 Foundations
02 Components
03 Marketing
04 Learn
05 Lesson Workspace
06 Playground
07 Challenges
08 Commands
09 Dashboard
10 Responsive
11 Prototypes
```

Foundations should contain:

```text
Colors
Typography
Spacing
Grid
Radius
Icons
Shadows
Motion
```

Components must use variants and Auto Layout.

Use reusable components rather than detached copies.

---

# 74. DESIGN SYSTEM QUALITY REQUIREMENT

The output should look like a product ready to be implemented by a professional frontend team.

Do not return only conceptual wireframes.

Create polished, high-fidelity UI.

Maintain the same:

- spacing
- colors
- typography
- border styles
- button styles
- panel layouts
- iconography

across every screen.

The final design should clearly feel like one product: **GitDojo**.
