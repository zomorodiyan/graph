// Sample graphs offered to new users via the "New Graph" card's left zone.
// `structure` is the same markdown-heading text used by clipboard copy/paste:
//   - "#"-depth headings are items; nesting depth = number of "#"s
//   - a heading's trailing "(x/y)" is progress, a trailing amount+unit is cost
//     (e.g. "## Title (3/5) $500") — see serializeStructure/parseMarkdownStructure
//   - there's no separate due-date field: a due date is a checkpoint whose
//     progress normalizes to done===total (see getItemDueDate). Templates author
//     checkpoint dates as "+Nd"/"-Nd" offsets (days from instantiation, negative
//     for already-overdue samples) so they never read as stale; `resolveTemplateDates`
//     resolves them to real YYYY-MM-DD dates
//   - plain text under a heading is that item's context note
// Each template flexes the features differently to suit its domain.

export interface GraphTemplate {
  name: string          // url-safe base name (deduped at create time)
  displayName: string
  description: string
  structure: string
}

// Replaces "- +Nd: x/y" checkpoint bullets with a real "- YYYY-MM-DD: x/y", N days
// from `now` (today by default). Templates author dates as offsets so they never
// read as stale/overdue no matter when a user creates the sample graph.
export function resolveTemplateDates(structure: string, now: Date = new Date()): string {
  return structure.replace(/^(- )([+-]\d+)d(:.*)$/gm, (_match, prefix: string, offset: string, rest: string) => {
    const d = new Date(now)
    d.setDate(d.getDate() + Number(offset))
    return `${prefix}${d.toISOString().slice(0, 10)}${rest}`
  })
}

export const GRAPH_TEMPLATES: GraphTemplate[] = [
  {
    name: 'career',
    displayName: 'Career',
    description: 'Research, advising, growth',
    structure: `# Projects
## Process Simulation (3/5)
Parameters drive part quality
Checkpoints:
- +67d: 5/5

## Multi-Material (2/4)
Interface behavior, dissimilar materials

## Digital Twin (1/4)
Sensor data feeds defect predictions

# Advising
## Advisor Meeting (0/1)
Bring blockers, not status
Checkpoints:
- +0d: 1/1

## Lab Meeting (3/4)

## Committee
### Qualifying Exam Feedback (60/100)
Feeds the candidacy defense
Checkpoints:
- +36d: 100/100

# Outreach
## Grant Proposal (1/4)
Checkpoints:
- +22d: 4/4
### Problem Statement

### Draft Narrative
Get advisor feedback first

### Budget Justification

## Conference Talk (1/3)

# Goals
## Publications
### Laser Interaction (1/3)
Pick venue before drafting
Checkpoints:
- +67d: 3/3
#### Checkpoint 1 (0/1)
Checkpoints:
- +5d: 1/1

#### Checkpoint 2 (0/1)
Checkpoints:
- +36d: 1/1

#### Checkpoint 3 (0/1)
Checkpoints:
- +67d: 1/1

### Multi-Material Simulation (1/3)
Checkpoints:
- +67d: 3/3
#### Checkpoint 1 (0/1)
Checkpoints:
- +5d: 1/1

#### Checkpoint 2 (0/1)
Checkpoints:
- +36d: 1/1

#### Checkpoint 3 (0/1)
Checkpoints:
- +67d: 1/1

## Candidacy Exam (3/6)
Track committee feedback
Checkpoints:
- +189d: 6/6

## Internship (1/5)
No citizenship requirement needed

## Next Position
### Postdoc

### Research Scientist
Start search a year out`,
  },
  {
    name: 'personal',
    displayName: 'Personal',
    description: 'People, health, home, downtime',
    structure: `# People
## Family
### Parents
Call every Sunday

### Siblings
#### Sister
Birthday — Mar 12

#### Brother

## Friends
### Close
#### Alex

#### Sam

### College

### Work

## Nurture
### Reach Out
It's been almost a year

### Birthdays

### Thank Yous

# Practice
## Skills
### Japanese (15/100)
#### Section 1 (9/9)
##### Lessons 1-5 (15/15)
Order Food, Describe People, Introduce Yourself, Order Food and Drink, Talk About Countries

##### Lessons 6-9 (12/12)
Ask for Directions, Describe Belongings, Talk About Neighbors, Tell Time

#### Section 2 (15/30)
##### Lessons 1-5 (15/15)
Get Help When Traveling, Get to Know People, Describe Your Family, Talk About Hobbies, Describe Eating Habits

##### Lessons 6-10 (15/15)
Shop for Clothes, Order Food and Drink, Use Present Tense Verbs, Get Around a Station, Describe Your Routine

##### Lessons 11-15 (15/15)
Talk About Interests, Describe Your Home, Take Public Transit, Use Na-Adjectives, Get Emergency Help

##### Lessons 16-20
Talk About Weather, Discuss Chores, Say What You Want to Do, Discuss a Family Visit, Order Pastries

##### Lessons 21-25
Use Negative Verbs, Discuss Classes, Talk About Jobs, Get Around a Theme Park, Discuss Media

##### Lessons 26-28
Communication at Work, Discuss Seasonal Events, Talk About Date Plans

#### Speaking
##### Weekly Tutor (0/1)
Checkpoints:
- +2d: 1/1

### Chess (6/20)
Tactics puzzles most days

## Queue
### Systems Design

### Photography

### Surfing

### Redwoods Trip
Coming target

## Output
### Notes

### Blog Posts

# Health
## Fitness (4/7)
### Cardio
#### Run
10 min

### Lower Back (60/100)
Recovering — nags after long desk days
#### PT Checkup (0/1)
Checkpoints:
- +15d: 1/1

#### Bird Dog

#### Dead Bug

### Knee
#### Terminal Knee Extension

#### Step-Ups

#### Wall Sit

### Shoulder
#### Face Pulls

#### Band Pull-Aparts

#### Scapular Push-Ups

### General
#### Squat (70/100)

#### Deadlift
1x5 @ 120kg

#### Bench Press
3x5 @ 80kg, then deload

## Nutrition
### Hydration
Target 2.5L per day

### Calories
Target ~2325 kcal per day (155lb x 15 kcal/lb)
#### Breakfast
~580 kcal

#### Lunch
~815 kcal

#### Dinner
~700 kcal

#### Snacks
~230 kcal

### Protein
Target ~124g per day (155lb x 0.8g/lb)
#### Breakfast
~31g

#### Lunch
~43g

#### Dinner
~37g

#### Snacks
~13g

### Fiber
Target ~30g per day

### Sugar & Processed Food
Keep added sugar under 30g per day

## Recovery
### Sleep
7-8 hours, consistent schedule

## Metrics
### Weight

### Bloodwork (0/1)
Checkpoints:
- +144d: 1/1

# Kitchen
## Recipes
### Weeknight
#### Stir Fry
20 minutes, one pan

#### Pasta Primavera

### Breakfast
#### Bread, Cheese, Walnuts or Vegetables

#### Sweetened Tea

#### Boiled Eggs

### Batch Meals
#### Tomato Stew (0/4)
Freeze the rest

#### Vegetable Stew (0/4)
Freeze the rest

#### Lasagna (0/4)
Freeze the rest

### To Try
#### Thai Green Curry

#### Shakshuka

## Groceries
### Produce
Bok choy for stir fry

### Pantry
Grains for batch cook
#### Rice

#### Potato

#### Onion (0/1)
Out — restock

#### Oil

#### Spices

#### Bread

#### Milk

#### Sugar

#### Yogurt

#### Fruits

#### Vegetables (0/1)
Out — restock

#### Lemons (0/1)
Out — restock

#### Eggs

#### Walnuts

### Proteins
Tofu for stir fry

## Meal Prep
### Batch Cook
Sundays, grains and roast veg

### Freezer Meals

# Chores
## Bedroom
### Clean

### Laundry

## Bathroom
### Clean

### Bathe

## Kitchen
### Clean

### Dishes

# Leisure
## Reading
### Sci-Fi

## Watchlist
### Anime
#### Watching
##### One Piece (1085/1120)
Egghead arc, no spoilers

##### Attack on Titan (4/4)
Rewatching before final chapter

#### Queue
##### Frieren

### Movies
#### Oppenheimer
Recommended by Sam

### Shows
#### Severance (6/9)

### Games
#### Hollow Knight: Silksong (60/100)

#### Minecraft

### Documentaries
#### Planet Earth

# Finances $2300
## Fixed Costs $1120
### Rent $950
Paid, my share of total

### Insurance $55
Share of total

### Subscriptions $30
Share of total

## Budgeted $880
### Groceries $200

### Dining Out $60

### Transport $65

### Clothes $0

### Household Supplies $20
Cleaning, bathroom

### Office Supplies $10
Pens, paper, small gear

### Personal Care $30

### Health/Medical $40
Copays, prescriptions

## Investments $300
### Roth IRA $50
Monthly contribution

### Emergency Fund $250
Monthly contribution — lawyer, income gaps, health, gifts

## Goals
### Pay Off Loan (0/12000)
Checkpoints:
- +1000d: 12000/12000

# Daily Rhythm
## Wake 6am

## Clean

## Breakfast

## Commute

## Workout
Alternate run and lift days

## Plan Day
### Top 3 Tasks

## Focus
Phone in another room

## Lunch

## Focus

## Commute

## Cook
Wed, Fri

## Family Time

## Wind Down
### Read
30 min, no screens

### Journal
One good, one hard

## Sleep by 11pm

## Weekend
### Meal Prep

### Long Walk

### Grocery Run
Restock pantry, produce for the week

### Review Budget
Check spend against Budgeted categories

# Admin
## Visa Status (0/1)
Renew before it expires
Checkpoints:
- +53d: 1/1

## ID Renewal

## Taxes (0/1)
Checkpoints:
- +279d: 1/1`,
  },
]
