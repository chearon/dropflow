// Binary search that returns the position `x` should be in
// The same as finding the index for an item to be placed in a sorted list
// If a match is found, returns the position before the match.
export function binarySearchIndex(a, x) {
  let l = 0, r = a.length - 1;

  while (true) {
    let i = Math.floor((l+r)/2);

    if (a[i] < x) {
      l = i + 1;
      if (l > r) return l;
    } else if (a[i] > x) {
      r = i - 1;
      if (r < l) return i;
    } else {
      return i;
    }
  }
}

export function bsearchj(a, x) {
  let l = 0, r = a.length - 1;

  while (true) {
    let i = Math.floor((l+r)/2);

    if (a[i].j < x) {
      l = i + 1;
      if (l > r) return l;
    } else if (a[i].j > x) {
      r = i - 1;
      if (r < l) return i;
    } else {
      return i;
    }
  }
}

let _id = 0;
export function id() {
  return _id++;
}

export function loggableText(text) {
  return text.replace(/\n/g, '⏎').replace(/\t/g, '␉');
}
