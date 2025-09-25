# Dropflow Layout System Specification

## Overview

Dropflow is a layout engine that implements CSS-style box model layout and rendering. The system is designed to handle both block and inline layout, with support for text layout, floats, and positioning.

## Core Components

### 1. Box Model

- `Box` class (layout-box.ts) - Base class for all layout boxes
- `BoxArea` class - Represents the geometric area of a box
- Supports margin, border, padding, and content areas
- Handles box sizing and positioning

### 2. Layout Flow

- `BlockFormattingContext` - Manages block-level layout
- `FloatContext` - Handles floating elements
- `InlineFormattingContext` - Manages inline-level layout
- Supports text layout, line breaking, and inline box positioning

### 3. Style System

- `Style` class - Handles computed styles
- `DeclaredStyle` - Manages declared styles
- Supports CSS properties including:
  - Box model properties (margin, border, padding)
  - Layout properties (display, position, float)
  - Text properties (font, line-height, text-align)
  - Visual properties (color, background)

### 4. Text Layout

- `Paragraph` - Handles text layout within blocks
- `Run` - Represents text runs with consistent styling
- `Linebox` - Manages line-level layout
- Supports text shaping, line breaking, and text alignment

## Layout Process

1. **Style Resolution**

   - Parse and cascade styles
   - Compute final values for all properties
   - Handle inheritance and initial values

2. **Box Tree Construction**

   - Create box tree from DOM
   - Assign styles to boxes
   - Handle anonymous boxes

3. **Prelayout**

   - Assign containing blocks
   - Shape text and gather font metrics
   - Handle relative positioning

4. **Layout**

   - Block formatting context layout
   - Float placement
   - Inline formatting context layout
   - Text layout and line breaking

5. **Postlayout**
   - Absolute positioning
   - Pixel snapping
   - Final position calculation

## Box Border Drawing Integration

### Current State

The system currently has support for border properties in the style system:

- Border width, style, and color properties
- Border area calculation in box model
- Logical border properties (block/inline)

### Required Changes for Border Drawing

1. **Box Model Updates**

   - Add border rendering to `Box` class
   - Implement border style rendering (solid, dashed, etc.)
   - Handle border radius (if supported)

2. **Layout System Updates**

   - Account for border width in layout calculations
   - Update box area calculations to include borders
   - Handle border collapse (if supported)

3. **Rendering System Updates**
   - Add border drawing to paint system
   - Implement border style rendering
   - Handle border color and opacity

### Implementation Strategy

1. **Box Model Changes**

   - Update `BoxArea` to include border dimensions
   - Add border rendering methods to `Box` class
   - Implement border style calculations

2. **Layout Changes**

   - Update `BlockFormattingContext` to account for borders
   - Modify float placement to consider border width
   - Update inline layout to handle bordered elements

3. **Rendering Changes**
   - **Integration with Paint System:** Modify the existing paint traversal (e.g., a `PaintingVisitor` or a `renderBox` method within each `Box` subclass) to incorporate border drawing. This step occurs after the background is painted but before child content is rendered.
   - **Border Path Generation:** For each box with borders, generate the path(s) for the border(s) based on the box's dimensions (content, padding, and border-width). This needs to account for the `border-style`.
   - **Style-Specific Rendering Routines:**
     - `solid`: Draw a continuous line along the generated path.
     - `dashed`: Draw a series of dashes along the path, respecting `border-color`. Dash length and gap might be predefined or configurable.
     - `dotted`: Draw a series of dots (or small squares/circles) along the path.
     - `double`: Draw two parallel solid lines, with a gap between them, ensuring the total width matches `border-width`. The gap itself should be transparent or background color.
   - **Color and Opacity:** Apply the computed `border-color` and any relevant opacity values during the drawing operations.
   - **Border Radius Handling (if supported):** If `border-radius` is implemented, the border path generation must create rounded corners. Each border segment (top, right, bottom, left) might need to be drawn as an arc and straight line combination.

### Border Style Support

1. **Basic Styles**

   - solid
   - dashed
   - dotted
   - double

2. **Advanced Styles** (if supported)
   - groove
   - ridge
   - inset
   - outset

### Performance Considerations

1. **Border Caching**

   - Cache border calculations
   - Reuse border paths where possible
   - Optimize border style rendering

2. **Layout Optimization**
   - Minimize layout recalculations
   - Cache border dimensions
   - Optimize border style changes

### Implementation Status (COMPLETED)

#### Phase 1: PaintBackend Enhancement ✅

- Added `path()` method to `PaintBackend` interface for SVG path rendering
- Added stroke pattern properties: `strokeDasharray`, `strokeLinecap`, `strokeLinejoin`
- Maintained backward compatibility with existing `edge()` calls

#### Phase 2: Border Constants and Utilities ✅

- Added border pattern constants for dashed and dotted styles
- Created `getStrokePropertiesFromBorder()` function to convert border styles to stroke properties
- Added helper functions: `isBorderVisible()`, `bordersMatch()`

#### Phase 3: Border Segment Detection ✅

- Implemented `getBorderSegments()` logic to detect contiguous border segments
- Created `BoxBorderSegment` type for tracking uniform adjacent borders
- Added segment matching logic for optimized rendering (full, three-side, two-side, single-side segments)

#### Phase 4: Path Generation ✅

- Implemented `generateBorderPath()` and `generateSegmentPath()` functions
- Added support for border-radius (values will be zero until parser supports them)
- Handles double border insets using 1/3 and 5/3 factors
- Generates SVG path strings with proper arcs for rounded corners

#### Phase 5: Paint System Integration ✅

- Updated `paintBlockBackground()` to use the new border system
- Replaced simple `edge()` calls with advanced path-based rendering
- Added support for different border styles (solid, dashed, dotted, double)
- Maintained inline border painting (can be enhanced later with path-based system)

#### Phase 6: Backend Implementation ✅

- **SVG Backend:** Added stroke properties, implemented native SVG path rendering with proper stroke attributes
- **Canvas Backend:** Updated CanvasRenderingContext2D interface, implemented path() with Path2D support and fallback SVG parser for M/L/A/Z commands, handled optional methods with null checks
- **HTML Backend:** Implemented path() using inline SVG elements

#### Bug Fixes ✅

- **Double Border Rendering:** Fixed double borders appearing as solid lines by implementing proper positioning logic
  - Created `generateBorderPathForDouble()` function with correct inset calculations
  - Outer border positioned at border edge with 1/6 border width adjustment
  - Inner border positioned at 2/3 inset with proper spacing
  - Both lines now render as distinct 1/3 width strokes with proper gap
- **Border Style Rendering:** Fixed dotted and dashed border rendering to match CSS specifications
  - Dash arrays now properly multiply by border width for correct proportions
  - Dotted borders use "round" line caps, dashed borders use "butt" line caps
  - Stroke patterns scale correctly with border thickness
- **Border Radius Scaling:** Added proper radius overlap handling and proportional scaling
  - Implements radius ratio calculation to prevent overlapping corners
  - Scales all radii proportionally when they would exceed available space
  - Handles complex geometry correctly for both single and double borders
- **Path Closing Logic:** Fixed incomplete border rendering for complete rectangular borders
  - Added logic to close SVG paths only when all four sides are present
  - Eliminates notches and gaps in complete borders (like solid borders on all sides)
  - Prevents inappropriate path closing for partial border segments

#### Border Radius Implementation ✅

- **CSS Parser Enhancement:** Updated `parse-css.pegjs` to support border-radius properties according to CSS Backgrounds and Borders Module Level 3
  - Added individual corner properties: `border-top-left-radius`, `border-top-right-radius`, `border-bottom-right-radius`, `border-bottom-left-radius`
  - Added shorthand `border-radius` property with 1-4 value syntax support
  - Support for both circular (single value) and elliptical (horizontal/vertical values) radii
- **Style System Integration:** Enhanced `style.ts` with complete border-radius support
  - Added `BorderRadius` type supporting length, percentage, and elliptical values
  - Added border-radius properties to `DeclaredStyleProperties` and `ComputedStyle` interfaces
  - Implemented `getBorderTopLeftRadius()`, `getBorderTopRightRadius()`, `getBorderBottomRightRadius()`, `getBorderBottomLeftRadius()` methods
  - Proper percentage resolution and logical property mapping
- **Paint System Integration:** Complete border path generation and rendering system restored
  - Restored all border path generation functions: `generateSegmentPath()`, `generateBorderPath()`, `generateBorderPathForDouble()`
  - Restored border utility functions: `getStrokePropertiesFromBorder()`, `isBorderVisible()`, `bordersMatch()`
  - Restored border segment detection with `getBorderSegments()` for optimization
  - Updated `paintBlockBackground()` to use advanced path-based border rendering
  - Full support for border-radius values from style system in path generation

#### Current Capabilities

- **Block Element Borders:** Full support for dashed, dotted, double, and solid borders
- **Double Border Fix:** Double borders now render correctly as two separate lines with proper spacing
- **Segment Optimization:** Automatically detects and optimizes contiguous border segments
- **Border Radius Support:** Complete CSS border-radius implementation with parser, style system, and rendering support
- **Style Patterns:** Proper dash and dot patterns with correct line caps
- **Cross-Platform:** Works across SVG, Canvas, and HTML backends

#### Next Steps (Lower Priority)

- **Inline Border Enhancement:** Apply path-based system to inline borders for better style support
- **Advanced Border Styles:** Implement groove, ridge, inset, outset styles
- **Performance Optimization:** Add path caching for repeated border patterns

## Fragmentation Implementation Strategy

Implementing CSS fragmentation (e.g., for paged media or multi-column layouts) requires significant additions and modifications to the layout system. The goal is to break content across logical boundaries (fragmentainers) while respecting properties like `break-before`, `break-after`, `break-inside`, `widows`, and `orphans`.

### 1. Fragmentation Context and Fragmentainers

- **`FragmentationContext` Class:** Introduce a new context to manage the overall fragmentation process. This would be responsible for:
  - Defining the dimensions and properties of fragmentainers (e.g., page size, column width/count).
  - Iterating through content and distributing it into available fragmentainers.
- **`FragmentainerBox` (or `PageBox`, `ColumnBox`):** A new type of box representing an individual fragmentainer. It defines a viewport for a portion of the content.

### 2. Layout Process Modifications

- **Initial Layout Pass:** Perform an initial layout pass similar to the current process, but with an understanding of available space within the _first_ fragmentainer.
- **Break Point Identification:**
  - During or after the initial layout of content within a fragmentainer, identify potential break points.
  - Consider CSS properties (`break-before`, `break-after`, `break-inside`).
  - Implement logic for `widows` and `orphans` for block-level content and text.
  - Forced breaks (`page-break-before/after`, `column-break-before/after`) must be respected.
- **Content Splitting and Continuation:**
  - **`Box` Splitting:** Modify `Box` classes (both block and inline) to support splitting. A box might be partially rendered in one fragmentainer and continued in the next.
    - This involves cloning the box properties and adjusting its geometry and content for the new fragmentainer.
    - Margins, borders, and padding at the split point need careful handling (e.g., `box-decoration-break`).
  - **`InlineFormattingContext` and `LineBox`:** Update to handle line breaking across fragmentainers. Text runs and inline boxes might be split.
  - \*\*`
