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
    "Parameters drive part quality"
  Multi-Material
    progress: 2/4
    "Interface behavior, dissimilar materials"
  Digital Twin
    progress: 1/4
    "Sensor data feeds defect predictions"
Advising
  Advisor Meeting
    due: 2026-07-10
    "Bring blockers, not status"
  Lab Meeting
    progress: 3/4
  Committee
    Qualifying Exam Feedback
      progress: 60/100
      due: 2026-08-15
      "Feeds the candidacy defense"
Outreach
  Grant Proposal
    progress: 1/4
    due: 2026-08-01
    Problem Statement
    Draft Narrative
      "Get advisor feedback first"
    Budget Justification
  Conference Talk
    progress: 1/3
Goals
  Publications
    Laser Interaction
      progress: 1/3
      due: 2026-09-15
      "Pick venue before drafting"
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
    "Track committee feedback"
  Internship
    progress: 1/5
    "No citizenship requirement needed"
  Next Position
    Postdoc
    Research Scientist
    "Start search a year out"`,
  },
  {
    name: 'self',
    displayName: 'Self',
    description: 'Practice, fitness, daily rhythm',
    structure: `Practice
  Skills
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
      "Tactics puzzles most days"
    Machine Learning
      Fundamentals
      Projects
  Queue
    Systems Design
    Photography
    Surfing
    Redwoods Trip
      "Coming target"
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
        "45 min, HR under 140"
      Intervals
  Nutrition
    Hydration
      "Target 2.5L per day"
    Protein
  Recovery
    Sleep
      "7-8 hours, consistent schedule"
    Lower Back
      "Nags after long desk days"
      PT Checkup
        due: 2026-07-25
  Metrics
    Weight
    Bloodwork
      due: 2026-12-01
Leisure
  Reading
    Sci-Fi
  Watchlist
    Anime
      Watching
        One Piece
          progress: 1085/1120
          "Egghead arc, no spoilers"
        Attack on Titan
          progress: 4/4
          "Rewatching before final chapter"
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
      "Alternate run and lift days"
    Plan Day
      Top 3 Tasks
    Commute
      "By bicycle"
      Bike Maintenance
        due: 2026-07-20
        "Chain, brakes, tire pressure"
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
        "One good, one hard"
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
      "It's been almost a year"
    Birthdays
    Thank Yous
Kitchen
  Recipes
    Weeknight
      Stir Fry
        "20 minutes, one pan"
      Pasta Primavera
    Breakfast
      Bread, Cheese, Walnuts or Vegetables
      Sweetened Tea
      Boiled Eggs
    Batch Meals
      Tomato Stew
        progress: 0/4
        "Freeze the rest"
      Vegetable Stew
        progress: 0/4
        "Freeze the rest"
      Lasagna
        progress: 0/4
        "Freeze the rest"
    To Try
      Thai Green Curry
      Shakshuka
  Groceries
    Produce
      "Bok choy for stir fry"
    Pantry
      "Grains for batch cook"
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
      "Sundays, grains and roast veg"
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
      progress: 950/2300
      "Share of monthly income"
    Utilities
      progress: 135/150
    Insurance
      progress: 110/110
    Subscriptions
      progress: 55/60
  Investments
    Roth IRA
      progress: 600/6500
      "$50 per month"
    Emergency Fund
      progress: 3000/7500
      "Lawyer, income gaps, health, gifts"
  Goals
    Pay Off Loan
      progress: 1200/6000
      due: 2027-01-01
Admin
  Visa Status
    due: 2026-09-01
    "Renew before it expires"
  ID Renewal
  Taxes
    due: 2027-04-15`,
  },
]
