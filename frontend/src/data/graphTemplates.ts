// Sample graphs offered to new users via the "New Graph" card's left zone.
// `structure` is 2-space-indented text in the same format as clipboard paste:
//   - a line is an item; nesting is by indentation
//   - `progress: N` / `due: YYYY-MM-DD` are properties of the item above
//   - a "quoted" line sets that item's context note

export interface GraphTemplate {
  name: string          // url-safe base name (deduped at create time)
  displayName: string
  description: string
  icon: string
  structure: string
}

export const GRAPH_TEMPLATES: GraphTemplate[] = [
  {
    name: 'work',
    displayName: 'Work',
    description: 'Projects, skills, network and admin in one view.',
    icon: '💼',
    structure: `Projects
  Q3 Launch
    progress: 40
    Spec
    Build
    QA
    Ship
      due: 2026-09-15
  Maintenance
    Bugs
    Tech Debt
Skills
  Deepen
    System Design
    Leadership
  Explore
    New Tooling
Network
  Mentors
  Peers
  Reports
Admin
  Expenses
  Reviews
    due: 2026-07-31`,
  },
  {
    name: 'health',
    displayName: 'Health',
    description: 'Training, nutrition, recovery and the metrics you track.',
    icon: '🏃',
    structure: `Fitness
  progress: 60
  Strength
    Upper
    Lower
    Core
  Cardio
    Runs
    Cycling
  Mobility
    Stretching
    Yoga
Nutrition
  Protein
  Vegetables
  Hydration
    "Target 2.5L per day"
Recovery
  Sleep
    "7-8 hours, consistent schedule"
  Rest Days
Metrics
  Weight
  Resting HR
  Bloodwork
    due: 2026-12-01`,
  },
  {
    name: 'finance',
    displayName: 'Finance',
    description: 'Income, fixed costs, spending, investments and money goals.',
    icon: '💰',
    structure: `Income
  Salary
  Side
Fixed Costs
  Rent
  Utilities
  Insurance
  Subscriptions
Spending
  Groceries
  Dining
  Shopping
Investments
  Emergency Fund
    progress: 80
    "Six months of expenses"
  Retirement
    progress: 35
  Index Funds
Goals
  Pay Off Loan
    due: 2027-01-01
  House Down Payment
    progress: 20`,
  },
  {
    name: 'learning',
    displayName: 'Learning',
    description: 'What you study now, your queue, practice and output.',
    icon: '📚',
    structure: `Now
  Spanish
    progress: 45
    Vocab
    Speaking
  Machine Learning
    Fundamentals
    Projects
Queue
  Systems Design
  Photography
Practice
  Daily Drills
  Side Projects
Output
  Notes
  Blog Posts
  Teach Others
    "Best way to solidify understanding"
Resources
  Courses
  Books
  Mentors`,
  },
  {
    name: 'travel',
    displayName: 'Travel',
    description: 'A trip in phases — research, logistics, itinerary, budget.',
    icon: '✈️',
    structure: `Japan Trip
  progress: 30
  Research
    Destinations
    Best Season
  Logistics
    Flights
    Visa
    Insurance
  Itinerary
    Tokyo
    Kyoto
    Osaka
  Budget
    "Target 3000 USD total"
  Booked
    due: 2026-08-01
Someday
  Patagonia
  Iceland
  Morocco`,
  },
  {
    name: 'home',
    displayName: 'Home',
    description: 'Maintenance, rooms, purchases and household routines.',
    icon: '🏠',
    structure: `Maintenance
  Urgent
    Leaky Faucet
  Scheduled
    HVAC Filter
    Smoke Detectors
  Seasonal
    Gutters
    Winterize
Rooms
  Kitchen
  Bedroom
  Garage
    Declutter
Purchases
  Furniture
  Appliances
Routines
  Cleaning
  Laundry
  Groceries`,
  },
  {
    name: 'relationships',
    displayName: 'Relationships',
    description: 'Map your social world and who you want to stay close to.',
    icon: '🤝',
    structure: `Family
  Parents
    "Call every Sunday"
  Siblings
  Extended
Friends
  Close
  College
  Work
Professional
  Mentors
  Peers
Community
  Neighbors
  Volunteer
Nurture
  Reach Out
    "Reconnect with old friends"
  Birthdays
  Thank Yous`,
  },
  {
    name: 'goals',
    displayName: 'Goals',
    description: 'Vision down to the quarter — the graph that ties the rest together.',
    icon: '🎯',
    structure: `Vision
  Five Year
    "Where do I want to be"
  Ten Year
This Year
  Career
    progress: 25
  Health
    progress: 40
  Relationships
  Financial
Quarter
  Q3 Focus
    due: 2026-09-30
Month
  Top Three
Review
  Weekly
  Monthly
    "Reflect and adjust"`,
  },
  {
    name: 'routine',
    displayName: 'Daily Routine',
    description: 'Your day in blocks — morning, midday, evening, night.',
    icon: '🌅',
    structure: `Morning
  Wake Early
  Hydrate
  Workout
  Shower
  Plan Day
Midday
  Lunch
  Short Walk
  Deep Work
Evening
  Commute
  Cook
  Family Time
Night
  Review Day
  Read
    "30 minutes, no screens"
  Prepare Tomorrow
  Sleep
Weekend
  Meal Prep
  Errands
  Rest`,
  },
  {
    name: 'meals',
    displayName: 'Meals',
    description: 'Go-to meals, recipes to try, groceries and prep.',
    icon: '🍳',
    structure: `Breakfast
  Oatmeal
  Eggs
  Smoothie
Lunch
  Salads
  Grain Bowls
  Leftovers
Dinner
  Protein
  Vegetables
  Starch
Recipes
  To Try
    "Thai green curry"
  Favorites
Groceries
  Produce
  Pantry
  Proteins
Prep
  Batch Cook
    "Sundays"
  Freezer Meals`,
  },
  {
    name: 'hobbies',
    displayName: 'Hobbies',
    description: 'Creative and outdoor pursuits, games and collections.',
    icon: '🎨',
    structure: `Music
  Guitar
    progress: 50
    Chords
    Songs
  Listening
Making
  Woodworking
  Drawing
    "Daily sketch practice"
Outdoors
  Hiking
  Photography
    Gear
    Editing
Games
  Board Games
  Video Games
Collecting
  Vinyl
  Books`,
  },
  {
    name: 'watchlist',
    displayName: 'Watchlist',
    description: 'Movies, shows, games and docs — from queue to finished.',
    icon: '🍿',
    structure: `Movies
  To Watch
    Dune
    Oppenheimer
  Watched
    Favorites
Shows
  Watching
    progress: 40
  Queue
  Finished
Games
  Playing
  Backlog
  Wishlist
Documentaries
  Nature
  History`,
  },
]
