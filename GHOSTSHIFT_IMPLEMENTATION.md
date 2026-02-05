# Ghost Shift Card Implementation

## Overview
The Ghost Shift card has been fully implemented with the following behavior:

## Execution Flow

### 1. **Card Selection & APPLY** (Immediate)
- Player clicks Ghost Shift card during battle mode
- Confirmation dialog appears with card description
- Player clicks **APPLY**
- **Energy reduced by 3** (cost spent immediately)
- **Card consumed** (removed from hand)
- All undamaged modules turn **blue** (ghost-available class)
- Game logs: "GHOST SHIFT: selecting target module..."

### 2. **First Wait (0.5 seconds)**
- Blue highlighting shows available modules
- System internally:
  - Collects all undamaged modules
  - Filters modules with valid teleport positions
  - Randomly selects one module to teleport

### 3. **Module Selection & Highlighting**
- After 0.5s delay, selected module gets **brighter blue** (ghost-selected class)
- Other modules fade back to normal color
- Game logs: "GHOST SHIFT: teleporting module..."
- Sound effect plays (move SFX)

### 4. **Second Wait (0.5 seconds)**
- Module shown with brighter highlighting
- System internally:
  - Calculates all valid positions for the selected module
  - Validates no bounds violations
  - Validates no collision with other modules
  - Validates no overlap with hit cells (damaged segments)
  - Randomly selects a valid destination position

### 5. **Placement & Effect** (After 0.5s)
- Module removed from old position
- Module placed at new random position
- **Blink effect** applied (animation + visual pulse)
- All ghost styling cleared (modules return to normal)
- Game logs: "GHOST SHIFT: deployment successful."
- Turn ends, action consumed

## Validation & Collision Detection

### Three-Phase Collision Checking:
1. **Bounds Check**: New position must be within 15×15 grid
2. **Module Collision**: New position cannot overlap with other modules
3. **Hit Cell Collision**: New position cannot place segments on damaged cells

If no valid positions exist, Ghost Shift fails with message: "GHOST SHIFT: no valid positions for teleport."

## CSS Styling

### Ghost-Related Classes:
- `.ghost-available`: `rgba(0,204,255,.45)` with `0 0 10px glow` - Shows available modules during selection phase
- `.ghost-selected`: `rgba(0,204,255,.55)` with `0 0 16px glow` - Shows selected module with brighter blue
- `.blink`: Animated border pulse effect on placement

## Code Components

### Main Function: `executeGhostShift()` (Lines 787-875)
```javascript
1. Collect available modules (undamaged)
2. Pick random module
3. Find all valid positions (bounds + collision checks)
4. Highlight selected module (ghost-selected class)
5. Wait 500ms
6. Move module to random valid position
7. Apply blink effect
8. Clear all ghost states
9. End player action
```

### Trigger: `selectCard()` (Lines 595-625)
```javascript
if(card.how === 'ghost'){
  // Spend cost
  const cost = cardCost(card);
  if(!spend(cost)) return; // Fail if insufficient resources
  
  // Consume card immediately
  consumeCard();
  
  // Highlight available modules
  highlightAvailableModules();
  
  // Wait 0.5s then execute teleport
  setTimeout(() => { executeGhostShift(); }, 500);
}
```

### Helper Functions:
- `highlightAvailableModules()`: Adds ghost-available class to undamaged modules
- `clearAllGhostStates()`: Removes all ghost-related CSS classes from cells
- `coordsAt()`: Calculates module coordinates for a given shape and position
- `spend()`: Deducts energy cost
- `consumeCard()`: Removes card from player hand
- `afterPlayerAction()`: Ends player turn

## Testing Checklist

When testing Ghost Shift:
- [ ] Card appears in hand during battle mode
- [ ] Clicking card shows confirmation dialog
- [ ] APPLY button visible and clickable
- [ ] Energy reduced by 3 after APPLY
- [ ] Card disappears from hand after APPLY
- [ ] All undamaged modules turn blue
- [ ] After 0.5s, one random module highlights brighter
- [ ] Other modules fade to normal color
- [ ] After another 0.5s, module moves to new position
- [ ] Module shows blink effect on placement
- [ ] Module cannot overlap with other modules or hit cells
- [ ] Game message appears: "GHOST SHIFT: deployment successful."
- [ ] Turn ends and AI plays next
- [ ] Works with partially damaged ships (can only teleport undamaged modules)
- [ ] Fails gracefully if no valid positions available

## Timing Diagram

```
APPLY clicked
    ↓
[Energy spent, Card consumed, Blue highlight on]
    ↓ (0.5s)
[Random module selected, Brighter blue highlight]
    ↓ (0.5s)
[Module teleported to random position, Blink effect]
    ↓
[Ghost states cleared, Normal colors restored]
    ↓
[Turn ends, AI plays]
```

## Total Timing
- Initial phase to blue highlight: 0s (instant)
- Selection phase: 0.5s
- Placement phase: 0.5s
- Blink animation: 0.22s (simultaneous with placement)
- **Total: ~1 second from APPLY to completion**
