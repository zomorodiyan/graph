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
    description: 'Research, advising, growth',
    structure: `Projects
  Process Simulation
    progress: 3/5
    due: 2026-09-15
    "Model the process parameters that drive part quality"
  Multi-Material
    progress: 2/4
    "Focus on the interface behavior between dissimilar materials"
  Digital Twin
    progress: 1/4
    "Feed real-time sensor data back into the defect predictions"
Advising
  Advisor Meeting
    due: 2026-07-10
    "Bring blockers and preliminary results, not just status"
  Lab Meeting
    progress: 3/4
  Committee
    Qualifying Exam Feedback
      progress: 60/100
      due: 2026-08-15
      "Feeds directly into the candidacy defense prep below"
Grants & Talks
  Grant Proposal
    progress: 1/4
    due: 2026-08-01
    Problem Statement
    Draft Narrative
      "Get feedback from advisor before the internal deadline"
    Budget Justification
  Conference Talk
    progress: 1/3
Goals
  Publications
    Laser Interaction
      progress: 1/3
      due: 2026-09-15
      "Target a venue before drafting, not after"
      Checkpoint 1
        due: 2026-07-15
      Checkpoint 2
        due: 2026-08-15
      Checkpoint 3
        due: 2026-09-15
    Multi-Material Simulation
      progress: 1/3
      due: 2026-09-15
      Checkpoint 1
        due: 2026-07-15
      Checkpoint 2
        due: 2026-08-15
      Checkpoint 3
        due: 2026-09-15
  Candidacy Exam
    progress: 3/6
    due: 2027-01-15
    "Built from committee feedback — track it as it comes in"
  Internship
    progress: 1/5
    "No citizenship requirement, open to out-of-state — cast a wide net"
  Next Position
    Postdoc
    Research Scientist
    "Start the search a year out; academic hiring cycles are slow"`,
  },
  {
    name: 'self',
    displayName: 'Self',
    description: 'Learning, fitness, daily rhythm',
    structure: `Learning
  Now
    Japanese
      progress: 15/100
      Section 1
        progress: 9/9
        Order Food
          progress: 3/3
        Describe People
          progress: 3/3
        Introduce Yourself
          progress: 3/3
        Order Food and Drink
          progress: 3/3
        Talk About Countries
          progress: 3/3
        Ask for Directions
          progress: 3/3
        Describe Belongings
          progress: 3/3
        Talk About Neighbors
          progress: 3/3
        Tell Time
          progress: 3/3
      Section 2
        progress: 15/30
        Get Help When Traveling
          progress: 3/3
        Get to Know People
          progress: 3/3
        Describe Your Family
          progress: 3/3
        Talk About Hobbies
          progress: 3/3
        Describe Eating Habits
          progress: 3/3
        Shop for Clothes
          progress: 3/3
        Order Food and Drink
          progress: 3/3
        Use Present Tense Verbs
          progress: 3/3
        Get Around a Station
          progress: 3/3
        Describe Your Routine
          progress: 3/3
        Talk About Interests
          progress: 3/3
        Describe Your Home
          progress: 3/3
        Take Public Transit
          progress: 3/3
        Use Na-Adjectives
          progress: 3/3
        Get Emergency Help
          progress: 3/3
        Talk About Weather
        Describe Your Family
        Discuss Chores
        Say What You Want to Do
        Discuss a Family Visit
        Order Pastries
        Use Negative Verbs
        Discuss Classes
        Talk About Jobs
        Get Around a Theme Park
        Discuss Media
        Communication at Work
        Talk About Hobbies
        Discuss Seasonal Events
        Talk About Date Plans
      Speaking
        Weekly Tutor
          due: 2026-07-05
    Chess
      progress: 6/20
      "Working through tactics puzzles most days"
    Machine Learning
      Fundamentals
      Projects
  Queue
    Systems Design
    Photography
    Surfing
  Output
    Notes
    Blog Posts
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
    Anime
      Watching
        One Piece
          progress: 1085/1120
          "Egghead arc — no spoilers past this"
        Attack on Titan
          progress: 4/4
          "Rewatching before the final chapter manga"
      Queue
        Frieren
    Movies
      Oppenheimer
        "Recommended by Sam"
    Shows
      Severance
        progress: 6/9
    Games
      Elden Ring
        progress: 65/100
    Documentaries
      Planet Earth
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
    name: 'home',
    displayName: 'Home',
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
Kitchen
  Recipes
    Weeknight
      Stir Fry
        "Tofu, bok choy, garlic ginger sauce — 20 minutes, one pan"
      Pasta Primavera
    Breakfast
      Bread, Cheese, Walnuts or Vegetables
      Sweetened Tea
      Boiled Eggs
    Batch Meals
      Tomato Stew
        progress: 0/4
        "Makes 4 meals — freeze the rest"
      Vegetable Stew
        progress: 0/4
        "Makes 4 meals — freeze the rest"
      Lasagna
        progress: 0/4
        "Makes 4 meals — freeze the rest"
    To Try
      Thai Green Curry
      Shakshuka
  Groceries
    Produce
      "Bok choy for stir fry"
    Pantry
      "Garlic ginger sauce, grains for batch cook"
      Rice
      Potato
      Onion
        progress: 0/1
        "Out — restock"
      Oil
      Spices
      Bread
      Milk
      Sugar
      Yogurt
      Fruits
      Vegetables
        progress: 0/1
        "Out — restock"
      Lemons
        progress: 0/1
        "Out — restock"
      Eggs
      Walnuts
    Proteins
      "Tofu for stir fry"
  Meal Prep
    Batch Cook
      "Sundays — grains and roast veg from this week's Groceries"
    Freezer Meals
Chores
  Bedroom
    Clean
    Laundry
  Bathroom
    Clean
    Bathe
  Kitchen
    Clean
    Dishes
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
