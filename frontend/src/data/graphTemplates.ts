// Sample graphs offered to new users via the "New Graph" card's left zone.
// `structure` is 2-space-indented text in the same format as clipboard paste:
//   - a line is an item; nesting is by indentation (depth is free-form)
//   - `progress: X/Y` (shown as "X%" when Y is 100, otherwise "X/Y") / `due: YYYY-MM-DD` are
//     properties of the item above
//   - a "quoted" line sets that item's context note
// Each template flexes the features differently to suit its domain.

export interface GraphTemplate {
  name: string          // url-safe base name (deduped at create time)
  displayName: string
  description: string
  structure: string
}

export const GRAPH_TEMPLATES: GraphTemplate[] = [
  {
    name: 'work',
    displayName: 'Work',
    description: 'Projects, team, growth',
    structure: `Projects
  Q3 Launch
    progress: 2/5
    due: 2026-09-15
    Backend
      API
        Auth
        Endpoints
      Database
        Migrations
    Frontend
      Components
      State
    QA
      "Block release on any critical bug"
  Maintenance
    Bugs
    Tech Debt
Operations
  1:1s
    due: 2026-07-10
    "Bring blockers, not just status"
  Mentors
  Reports
    progress: 3/4
  Expenses
    due: 2026-07-31
  Performance Review
    progress: 60/100
    due: 2026-08-15
    "Evidence feeds directly into the promotion case below"
Goals
  Promotion Case
    progress: 3/6
    "Built from Performance Review evidence — track write-ups as they happen"
  Certification
    due: 2027-01-01
  Conference Talk
    progress: 1/3`,
  },
  {
    name: 'body-mind',
    displayName: 'Body & Mind',
    description: 'Learning, fitness, daily rhythm',
    structure: `Learning
  Now
    Spanish
      progress: 45/100
      Grammar
        Subjunctive
          "Trickiest part — drill a little daily"
        Past Tenses
      Vocab
        Flashcards
      Speaking
        Weekly Tutor
          due: 2026-07-05
    Machine Learning
      Fundamentals
      Projects
  Queue
    Systems Design
    Photography
  Output
    Notes
    Blog Posts
Hobbies
  Guitar
    progress: 50/100
    Technique
      Barre Chords
        "Still buzzing on the B string"
      Fingerpicking
    Songs
      Learning
        Blackbird
        Wish You Were Here
      Mastered
        progress: 6/6
  Reading
    Sci-Fi
  Watchlist
    Movies
      To Watch
        Dune Part Two
        Oppenheimer
          "Recommended by Sam"
      Watched
        Arrival
    Shows
      Watching
        Severance
          progress: 6/9
      Queue
        The Bear
    Games
      Playing
        Elden Ring
          progress: 65/100
      Backlog
    Documentaries
      Planet Earth
Health
  Fitness
    progress: 4/7
    Strength
      Push
        Bench Press
          "3x5 @ 80kg, then deload"
        Overhead Press
      Pull
        Deadlift
          "1x5 @ 120kg"
        Rows
      Legs
        Squat
          progress: 70/100
    Cardio
      Zone 2
        "45 min, keep HR under 140"
      Intervals
  Nutrition
    Hydration
      "Target 2.5L per day"
    Protein
  Recovery
    Sleep
      "7-8 hours, consistent schedule — same target as Night's Sleep by 11pm"
  Metrics
    Weight
    Bloodwork
      due: 2026-12-01
Daily Rhythm
  Morning
    Wake 6am
    Workout
      "Alternate run and lift days — see Health > Fitness for the split"
    Plan Day
      Top 3 Tasks
  Midday
    Lunch
    Deep Work
      "Phone in another room"
  Evening
    Cook
    Family Time
  Night
    Wind Down
      Read
        "30 min, no screens"
      Journal
    Sleep by 11pm
  Weekend
    Meal Prep
    Long Walk`,
  },
  {
    name: 'home-relationships',
    displayName: 'Home & Relationships',
    description: 'House, meals, people',
    structure: `Relationships
  Family
    Parents
      "Call every Sunday"
    Siblings
      Sister
        "Birthday — Mar 12"
      Brother
  Friends
    Close
      Alex
      Sam
    College
    Work
  Nurture
    Reach Out
      "Reconnect — it's been almost a year"
    Birthdays
    Thank Yous
Maintenance
  Urgent
    Leaky Faucet
      "Call the plumber"
  Seasonal
    Spring
      Gutters
      Garden Beds
    Fall
      Winterize Pipes
      Furnace Service
        due: 2026-10-15
Rooms
  Garage
    Declutter
    Shelving
  Kitchen
  Purchases
    Vacuum
    Couch
Kitchen
  Recipes
    Weeknight
      Stir Fry
        "Tofu, bok choy, garlic ginger sauce — 20 minutes, one pan"
      Pasta Primavera
    To Try
      Thai Green Curry
      Shakshuka
  Groceries
    Produce
      "Bok choy for stir fry"
    Pantry
      "Garlic ginger sauce, grains for batch cook"
    Proteins
      "Tofu for stir fry"
  Meal Prep
    Batch Cook
      "Sundays — grains and roast veg from this week's Groceries"
    Freezer Meals
Finances
  Fixed Costs
    Rent
    Utilities
    Insurance
    Subscriptions
  Investments
    Retirement
      401k
        "Contribute up to the employer match first"
      Roth IRA
        progress: 35/100
    Brokerage
      Index Funds
        VTI
        VXUS
      Individual
    Emergency Fund
      progress: 80/100
      "Six months of expenses"
  Goals
    Pay Off Loan
      due: 2027-01-01
    House Down Payment
      progress: 20/100`,
  },
]
