# NoMoney

NoMoney is a personal finance management app built to help users understand where their money goes and make better decisions with it.

Instead of being just an expense tracker, NoMoney takes real bank transaction data, organizes it, and connects it to budgeting, savings, financial goals, and "what-if" decisions.

## What makes NoMoney different?

Most expense trackers tell you what you already spent.

NoMoney also lets you explore **what happens before you spend**.

For example, if you are considering a ₹6,000 purchase, NoMoney can show how that purchase could affect your current surplus, savings, and financial goals.

The core idea is:

**Real transaction data → Financial analysis → Better decisions**

## Features

* Import bank statements through PDF and CSV
* Extract and organize transactions automatically
* Separate incoming and outgoing transactions
* Categorize spending by type and importance
* Track budgets and spending
* Create and track savings goals
* Simulate hypothetical purchases with the Trade-off feature
* Track shared expenses and reimbursements
* Plan and track daily spending
* Export normalized transaction data
* Review and correct imported transactions

A key part of the project is that financial calculations such as balances, budgets, savings, goal progress, and trade-offs are handled by deterministic application logic rather than relying on an AI model for basic calculations.

## Tech Stack

* Next.js
* React
* TypeScript
* Tailwind CSS
* PDF / CSV processing
* Git & GitHub

## How it works

```text
Bank Statement
      ↓
Transaction Import
      ↓
Transaction Analysis
      ↓
Budgets / Savings / Goals
      ↓
Trade-off & Daily Planning
      ↓
Financial Overview
```

## Privacy

NoMoney does not require bank passwords or banking credentials.

Real bank statements should be processed locally during development and should never be committed to the repository.

## Project

NoMoney was built as a hackathon project with the goal of turning raw financial data into something users can actually use to plan and make decisions.

**Track your money. Understand it. Plan what comes next.**
