// Sample graphs offered to new users via the "New Graph" card's left zone.
// `structure` is 2-space-indented text in the same format as clipboard paste:
//   - a line is an item; nesting is by indentation (depth is free-form)
//   - `progress: N` / `due: YYYY-MM-DD` are properties of the item above
//   - a "quoted" line sets that item's context note
// Each template flexes the features differently to suit its domain.
// The emoji is part of `displayName`, so a created sample carries it in its name.

export interface GraphTemplate {
  name: string          // url-safe base name (deduped at create time)
  displayName: string
  description: string
  structure: string
}

export const GRAPH_TEMPLATES: GraphTemplate[] = [
  {
    name: 'work',
    displayName: '💼 Work',
    description: 'Projects broken down deep, plus team and admin.',
    structure: `Projects
  Q3 Launch
    progress: 40
    due: 2026-09-15
    Backend
      API
        Auth
          OAuth Flow
          Token Refresh
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
Team
  Mentors
  Reports
Admin
  Expenses
  Reviews
    due: 2026-07-31`,
  },
  {
    name: 'health',
    displayName: '🏃 Health',
    description: 'Training drilled into sets, plus nutrition and metrics.',
    structure: `Fitness
  progress: 60
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
        progress: 70
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
    "7-8 hours, consistent schedule"
Metrics
  Weight
  Bloodwork
    due: 2026-12-01`,
  },
  {
    name: 'finance',
    displayName: '💰 Finance',
    description: 'Accounts drilled down, costs flat, goals tracked.',
    structure: `Investments
  Retirement
    401k
      "Contribute up to the employer match first"
    Roth IRA
      progress: 35
  Brokerage
    Index Funds
      VTI
      VXUS
    Individual
  Emergency Fund
    progress: 80
    "Six months of expenses"
Fixed Costs
  Rent
  Utilities
  Insurance
  Subscriptions
Goals
  Pay Off Loan
    due: 2027-01-01
  House Down Payment
    progress: 20`,
  },
  {
    name: 'learning',
    displayName: '📚 Learning',
    description: 'One subject as a curriculum, others queued.',
    structure: `Now
  Spanish
    progress: 45
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
  Blog Posts`,
  },
  {
    name: 'travel',
    displayName: '✈️ Travel',
    description: 'Itinerary by city and day; logistics with deadlines.',
    structure: `Japan Trip
  progress: 30
  Logistics
    Flights
      due: 2026-08-01
    Visa
    Insurance
  Itinerary
    Tokyo
      Day 1
        Shibuya
        Shinjuku
      Day 2
        Asakusa
        TeamLab
          "Tickets sell out — book weeks ahead"
    Kyoto
      Fushimi Inari
      Kinkaku-ji
    Osaka
      Dotonbori
  Budget
    "Target 3000 USD all-in"
Someday
  Patagonia
  Iceland`,
  },
  {
    name: 'home',
    displayName: '🏠 Home',
    description: 'Maintenance by season and cadence — driven by dates.',
    structure: `Maintenance
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
  Couch`,
  },
  {
    name: 'relationships',
    displayName: '🤝 Relationships',
    description: 'Your people, mostly carried by little reminders.',
    structure: `Family
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
Professional
  Mentors
  Peers`,
  },
  {
    name: 'goals',
    displayName: '🎯 Goals',
    description: 'Horizons from vision to quarter, heavy on progress.',
    structure: `Vision
  Five Year
    "Lead a team, run a half marathon, own a home"
This Year
  Career
    progress: 25
    Get Promoted
      due: 2026-12-31
    Give a Talk
  Health
    progress: 40
    Half Marathon
      "Race day: Oct 18"
  Financial
    progress: 60
Quarter
  Q3 Focus
    due: 2026-09-30
Review
  Weekly
  Monthly`,
  },
  {
    name: 'routine',
    displayName: '🌅 Daily Routine',
    description: 'The day in blocks, annotated with little rules.',
    structure: `Morning
  Wake 6am
  Workout
    "Alternate run and lift days"
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
    name: 'meals',
    displayName: '🍳 Meals',
    description: 'Recipes down to ingredients, plus groceries and prep.',
    structure: `Recipes
  Weeknight
    Stir Fry
      Ingredients
        Tofu
        Bok Choy
        Garlic Ginger Sauce
      "20 minutes, one pan"
    Pasta Primavera
  To Try
    Thai Green Curry
    Shakshuka
Groceries
  Produce
  Pantry
  Proteins
Prep
  Batch Cook
    "Sundays — grains and roast veg"
  Freezer Meals
Breakfast
  Oatmeal
  Eggs`,
  },
  {
    name: 'hobbies',
    displayName: '🎨 Hobbies',
    description: 'One craft tracked in depth, others kept light.',
    structure: `Guitar
  progress: 50
  Technique
    Barre Chords
      "Still buzzing on the B string"
    Fingerpicking
  Songs
    Learning
      Blackbird
      Wish You Were Here
    Mastered
Photography
  Gear
    Camera
    Lenses
  Editing
Woodworking
  Bookshelf
    progress: 30
Reading
  Sci-Fi`,
  },
  {
    name: 'watchlist',
    displayName: '🍿 Watchlist',
    description: 'By medium and status; progress = how far through.',
    structure: `Movies
  To Watch
    Dune Part Two
    Oppenheimer
      "Recommended by Sam"
  Watched
    Favorites
      Arrival
Shows
  Watching
    Severance
      progress: 40
  Queue
    The Bear
  Finished
Games
  Playing
    Elden Ring
      progress: 65
  Backlog
Documentaries
  Planet Earth`,
  },
]
