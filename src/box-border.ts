import type { Color, BorderStyle, BorderRadius } from "./style.js";

// Border rendering constants

export const BORDER_DASHED_ARRAY = [4, 4];
export const BORDER_DOTTED_ARRAY = [0, 2];

export interface BorderInfo {
  width: number;
  style: BorderStyle;
  color: Color;
}

export type ComputedBorderRadius = {
  horizontal: number;
  vertical: number;
}

export interface BoxBorder {
  left: BorderInfo;
  top: BorderInfo;
  right: BorderInfo;
  bottom: BorderInfo;
  topLeft: ComputedBorderRadius;
  topRight: ComputedBorderRadius;
  bottomRight: ComputedBorderRadius;
  bottomLeft: ComputedBorderRadius;
}

export interface BoxBorderSegment {
  firstSide: "left" | "top" | "right" | "bottom";
  left: boolean;
  top: boolean;
  right: boolean;
  bottom: boolean;
}

// Get stroke properties for a border style
export function getStrokePropertiesFromBorder(border: BorderInfo): {
  strokeWidth: number;
  strokeColor: Color;
  strokeDasharray?: string;
  strokeLinecap?: "butt" | "round" | "square";
} {
  const base = {
    strokeWidth: border.width,
    strokeColor: border.color,
  };

  switch (border.style) {
    case "dashed":
      return {
        ...base,
        strokeDasharray: BORDER_DASHED_ARRAY.map((x) => x * border.width).join(
          " "
        ),
        strokeLinecap: "butt",
      };
    case "dotted":
      return {
        ...base,
        strokeDasharray: BORDER_DOTTED_ARRAY.map((x) => x * border.width).join(
          " "
        ),
        strokeLinecap: "round",
      };
    case "double":
      return {
        ...base,
        strokeWidth: base.strokeWidth / 3,
      };
    case "solid":
    default:
      return {
        ...base,
        strokeLinecap: "butt",
      };
  }
}
// Check if a border is visible (has width, style, and color alpha > 0)
export function isBorderVisible(border: BorderInfo): boolean {
  return (
    border.width > 0 &&
    border.style !== "none" &&
    border.style !== "hidden" &&
    border.color.a > 0
  );
}
// Check if two borders match (same width, style, and color)
function bordersMatch(border1: BorderInfo, border2: BorderInfo): boolean {
  return (
    border1.width === border2.width &&
    border1.style === border2.style &&
    border1.color.r === border2.color.r &&
    border1.color.g === border2.color.g &&
    border1.color.b === border2.color.b &&
    border1.color.a === border2.color.a
  );
}
// Check if a border has a radius
export function hasBorderRadius(border: BoxBorder): boolean {
  // for each corner, there's a radius if the value is a number or a percentage
  // that's greater than 0, or if it's an object and either horizontal or vertical is greater than 0
  // Percentages have a value and unit property; horizontal and vertical can be numbers or a Lenght or Percentage
  // each of which has a value property
  // NOTE: at the moment this only gets called with a ComputedBorderRadius, but leaving the code for
  // BorderRadius for now in case we need to support this directly...
  function hasRadius(radius: BorderRadius): boolean {
    if ( typeof radius === "number"  && radius > 0 ) {
      return true;
    } else if ( typeof radius === "object" && "value" in radius && "unit" in radius && radius.value > 0 ) {
      return true;
    } else if ( typeof radius === "object" && "horizontal" in radius && "vertical" in radius )
      {
        if ( typeof radius.horizontal === "number" && radius.horizontal > 0 ) {
          return true;
        } else if ( typeof radius.horizontal === "object" && "value" in radius.horizontal && radius.horizontal.value > 0 ) {
          return true;
        }
        if ( typeof radius.vertical === "number" && radius.vertical > 0 ) {
          return true;
        } else if ( typeof radius.vertical === "object" && "value" in radius.vertical && radius.vertical.value > 0 ) {
          return true;
        }
      }
    return false;
  }

  return hasRadius(border.topLeft) || hasRadius(border.topRight) || hasRadius(border.bottomRight) || hasRadius(border.bottomLeft);
}

// Detect contiguous border segments for optimization
export function getBorderSegments(borders: {
  left: BorderInfo;
  top: BorderInfo;
  right: BorderInfo;
  bottom: BorderInfo;
}): BoxBorderSegment[] {
  const { left, top, right, bottom } = borders;

  // Check for full uniform border
  if (isBorderVisible(left) &&
    isBorderVisible(top) &&
    isBorderVisible(right) &&
    isBorderVisible(bottom) &&
    bordersMatch(left, top) &&
    bordersMatch(top, right) &&
    bordersMatch(right, bottom)) {
    return [
      {
        firstSide: "left",
        left: true,
        top: true,
        right: true,
        bottom: true,
      },
    ];
  }

  // Check for three-side matches
  const segments: BoxBorderSegment[] = [];

  // Left-Top-Right
  if (isBorderVisible(left) &&
    isBorderVisible(top) &&
    isBorderVisible(right) &&
    bordersMatch(left, top) &&
    bordersMatch(top, right)) {
    segments.push({
      firstSide: "left",
      left: true,
      top: true,
      right: true,
      bottom: false,
    });
    if (isBorderVisible(bottom)) {
      segments.push({
        firstSide: "bottom",
        left: false,
        top: false,
        right: false,
        bottom: true,
      });
    }
    return segments;
  }

  // Top-Right-Bottom
  if (isBorderVisible(top) &&
    isBorderVisible(right) &&
    isBorderVisible(bottom) &&
    bordersMatch(top, right) &&
    bordersMatch(right, bottom)) {
    segments.push({
      firstSide: "top",
      left: false,
      top: true,
      right: true,
      bottom: true,
    });
    if (isBorderVisible(left)) {
      segments.push({
        firstSide: "left",
        left: true,
        top: false,
        right: false,
        bottom: false,
      });
    }
    return segments;
  }

  // Right-Bottom-Left
  if (isBorderVisible(right) &&
    isBorderVisible(bottom) &&
    isBorderVisible(left) &&
    bordersMatch(right, bottom) &&
    bordersMatch(bottom, left)) {
    segments.push({
      firstSide: "right",
      left: true,
      top: false,
      right: true,
      bottom: true,
    });
    if (isBorderVisible(top)) {
      segments.push({
        firstSide: "top",
        left: false,
        top: true,
        right: false,
        bottom: false,
      });
    }
    return segments;
  }

  // Bottom-Left-Top
  if (isBorderVisible(bottom) &&
    isBorderVisible(left) &&
    isBorderVisible(top) &&
    bordersMatch(bottom, left) &&
    bordersMatch(left, top)) {
    segments.push({
      firstSide: "bottom",
      left: true,
      top: true,
      right: false,
      bottom: true,
    });
    if (isBorderVisible(right)) {
      segments.push({
        firstSide: "right",
        left: false,
        top: false,
        right: true,
        bottom: false,
      });
    }
    return segments;
  }

  // Check for two-side matches
  // Left-Top
  if (isBorderVisible(left) &&
    isBorderVisible(top) &&
    bordersMatch(left, top)) {
    segments.push({
      firstSide: "left",
      left: true,
      top: true,
      right: false,
      bottom: false,
    });
  } else {
    if (isBorderVisible(left)) {
      segments.push({
        firstSide: "left",
        left: true,
        top: false,
        right: false,
        bottom: false,
      });
    }
    if (isBorderVisible(top)) {
      segments.push({
        firstSide: "top",
        left: false,
        top: true,
        right: false,
        bottom: false,
      });
    }
  }

  // Right-Bottom
  if (isBorderVisible(right) &&
    isBorderVisible(bottom) &&
    bordersMatch(right, bottom)) {
    segments.push({
      firstSide: "right",
      left: false,
      top: false,
      right: true,
      bottom: true,
    });
  } else {
    if (isBorderVisible(right)) {
      segments.push({
        firstSide: "right",
        left: false,
        top: false,
        right: true,
        bottom: false,
      });
    }
    if (isBorderVisible(bottom)) {
      segments.push({
        firstSide: "bottom",
        left: false,
        top: false,
        right: false,
        bottom: true,
      });
    }
  }

  return segments;
}
// Generate SVG path for a border segment with radius support
function generateSegmentPath(
  x: number,
  y: number,
  width: number,
  height: number,
  radii: {
    tlHor: number;
    tlVer: number;
    trHor: number;
    trVer: number;
    brHor: number;
    brVer: number;
    blHor: number;
    blVer: number;
  },
  segment: BoxBorderSegment
): string {
  let path = "";
  let started = false;

  const addLineOrMoveTo = (targetX: number, targetY: number) => {
    if (!started) {
      path += `M ${targetX} ${targetY}`;
      started = true;
    } else {
      path += ` L ${targetX} ${targetY}`;
    }
  };

  const addArcTo = (
    rx: number,
    ry: number,
    targetX: number,
    targetY: number
  ) => {
    if (rx > 0 && ry > 0) {
      path += ` A ${rx} ${ry} 0 0 1 ${targetX} ${targetY}`;
    } else {
      addLineOrMoveTo(targetX, targetY);
    }
  };

  // Handle each side of the segment
  if (segment.left) {
    // Left side: bottom-left corner to top-left corner
    if (segment.bottom) {
      // Start from bottom-left corner (after radius)
      addLineOrMoveTo(x, y + height - radii.blVer);
    } else {
      // Start from bottom of left side
      addLineOrMoveTo(x, y + height);
    }

    // Draw to top-left corner (before radius)
    if (radii.tlHor > 0 || radii.tlVer > 0) {
      addLineOrMoveTo(x, y + radii.tlVer);
      if (segment.top) {
        // Draw top-left arc
        addArcTo(radii.tlHor, radii.tlVer, x + radii.tlHor, y);
      }
    } else {
      addLineOrMoveTo(x, y);
      if (segment.top) {
        addLineOrMoveTo(x + radii.tlHor, y);
      }
    }
  }

  if (segment.top) {
    // Top side: top-left corner to top-right corner
    if (!segment.left) {
      // Start from left end of top side
      addLineOrMoveTo(x, y);
    }

    // Draw to top-right corner (before radius)
    if (radii.trHor > 0 || radii.trVer > 0) {
      addLineOrMoveTo(x + width - radii.trHor, y);
      if (segment.right) {
        // Draw top-right arc
        addArcTo(radii.trHor, radii.trVer, x + width, y + radii.trVer);
      }
    } else {
      addLineOrMoveTo(x + width, y);
      if (segment.right) {
        addLineOrMoveTo(x + width, y + radii.trVer);
      }
    }
  }

  if (segment.right) {
    // Right side: top-right corner to bottom-right corner
    if (!segment.top) {
      // Start from top of right side
      addLineOrMoveTo(x + width, y);
    }

    // Draw to bottom-right corner (before radius)
    if (radii.brHor > 0 || radii.brVer > 0) {
      addLineOrMoveTo(x + width, y + height - radii.brVer);
      if (segment.bottom) {
        // Draw bottom-right arc
        addArcTo(radii.brHor, radii.brVer, x + width - radii.brHor, y + height);
      }
    } else {
      addLineOrMoveTo(x + width, y + height);
      if (segment.bottom) {
        addLineOrMoveTo(x + width - radii.brHor, y + height);
      }
    }
  }

  if (segment.bottom) {
    // Bottom side: bottom-right corner to bottom-left corner
    if (!segment.right) {
      // Start from right end of bottom side
      addLineOrMoveTo(x + width, y + height);
    }

    // Draw to bottom-left corner (before radius)
    if (radii.blHor > 0 || radii.blVer > 0) {
      addLineOrMoveTo(x + radii.blHor, y + height);
      if (segment.left) {
        // Draw bottom-left arc
        addArcTo(radii.blHor, radii.blVer, x, y + height - radii.blVer);
      }
    } else {
      addLineOrMoveTo(x, y + height);
      if (segment.left) {
        addLineOrMoveTo(x, y + height - radii.blVer);
      }
    }
  }

  // Close path only if the segment includes all four sides
  if (segment.left && segment.top && segment.right && segment.bottom) {
    path += " Z";
  }

  return path;
}
// Generate border path with radius support
export function generateBorderPath(
  x: number,
  y: number,
  width: number,
  height: number,
  border: BoxBorder,
  segment: BoxBorderSegment,
  style: BorderStyle): string {
  const isDouble = style === "double";

  // Calculate geometry based on inset factor
  const calculateGeometry = (factor: number) => {
    const leftInset = (border.left.width * factor) / 2;
    const topInset = (border.top.width * factor) / 2;
    const rightInset = (border.right.width * factor) / 2;
    const bottomInset = (border.bottom.width * factor) / 2;

    const adjustedX = x + leftInset;
    const adjustedY = y + topInset;
    const adjustedWidth = width - leftInset - rightInset;
    const adjustedHeight = height - topInset - bottomInset;

    // Scale border radii proportionally with proper overlap handling
    // Only apply corner radii when both adjacent borders are present in the segment
    let tlHor = segment.left && segment.top
      ? Math.max(0, border.topLeft.horizontal - leftInset)
      : 0;
    let tlVer = segment.left && segment.top
      ? Math.max(0, border.topLeft.vertical - topInset)
      : 0;
    let trHor = segment.top && segment.right
      ? Math.max(0, border.topRight.horizontal - rightInset)
      : 0;
    let trVer = segment.top && segment.right
      ? Math.max(0, border.topRight.vertical - topInset)
      : 0;
    let brHor = segment.right && segment.bottom
      ? Math.max(0, border.bottomRight.horizontal - rightInset)
      : 0;
    let brVer = segment.right && segment.bottom
      ? Math.max(0, border.bottomRight.vertical - bottomInset)
      : 0;
    let blHor = segment.bottom && segment.left
      ? Math.max(0, border.bottomLeft.horizontal - leftInset)
      : 0;
    let blVer = segment.bottom && segment.left
      ? Math.max(0, border.bottomLeft.vertical - bottomInset)
      : 0;

    // Adjust radii ratios if they overlap (like in reference implementation)
    const topRatio = adjustedWidth / (tlHor + trHor || 1);
    const rightRatio = adjustedHeight / (trVer + brVer || 1);
    const bottomRatio = adjustedWidth / (blHor + brHor || 1);
    const leftRatio = adjustedHeight / (blVer + tlVer || 1);
    const smallestRatio = Math.min(
      topRatio,
      rightRatio,
      bottomRatio,
      leftRatio
    );

    if (smallestRatio < 1) {
      tlHor *= smallestRatio;
      tlVer *= smallestRatio;
      trHor *= smallestRatio;
      trVer *= smallestRatio;
      brHor *= smallestRatio;
      brVer *= smallestRatio;
      blHor *= smallestRatio;
      blVer *= smallestRatio;
    }

    return {
      x: adjustedX,
      y: adjustedY,
      width: adjustedWidth,
      height: adjustedHeight,
      radii: {
        tlHor,
        tlVer,
        trHor,
        trVer,
        brHor,
        brVer,
        blHor,
        blVer,
      },
    };
  };

  if (isDouble) {
    // Outer path (inset factor 1/3)
    const outerGeo = calculateGeometry(1 / 3);
    const path1 = generateSegmentPath(
      outerGeo.x,
      outerGeo.y,
      outerGeo.width,
      outerGeo.height,
      outerGeo.radii,
      segment,
    );

    // Inner path (inset factor 5/3)
    const innerGeo = calculateGeometry(5 / 3);
    const path2 = generateSegmentPath(
      innerGeo.x,
      innerGeo.y,
      innerGeo.width,
      innerGeo.height,
      innerGeo.radii,
      segment,
    );

    return path1 + (path1 && path2 ? " " : "") + path2; // Combine paths
  } else {
    const geometry = calculateGeometry(1);
    return generateSegmentPath(
      geometry.x,
      geometry.y,
      geometry.width,
      geometry.height,
      geometry.radii,
      segment
    );
  }
}
