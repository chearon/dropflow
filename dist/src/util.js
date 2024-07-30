/**
 * Binary search that returns the position `x` should be in
 */
export function binarySearch(a, x) {
    let l = 0, r = a.length - 1;
    while (true) {
        let i = Math.floor((l + r) / 2);
        if (a[i] < x) {
            l = i + 1;
            if (l > r)
                return l;
        }
        else if (a[i] > x) {
            r = i - 1;
            if (r < l)
                return i;
        }
        else {
            return i;
        }
    }
}
/**
 * Binary search that returns the position `x` should be in, using the `end`
 * property of objects in the `a` array
 */
export function binarySearchOf(a, x, end) {
    let l = 0, r = a.length - 1;
    if (r < 0)
        return -1;
    while (true) {
        let i = Math.floor((l + r) / 2);
        if (end(a[i]) < x) {
            l = i + 1;
            if (l > r)
                return l;
        }
        else if (end(a[i]) > x) {
            r = i - 1;
            if (r < l)
                return i;
        }
        else {
            return i;
        }
    }
}
/**
 * Binary search that returns the position `x` should be in, using the second
 * value in a tuple in the `a` array
 */
export function binarySearchTuple(a, x) {
    let l = 0, r = a.length - 1;
    if (r < 0)
        return -1;
    while (true) {
        let i = Math.floor((l + r) / 2);
        if (a[i][1] < x) {
            l = i + 1;
            if (l > r)
                return l;
        }
        else if (a[i][1] > x) {
            r = i - 1;
            if (r < l)
                return i;
        }
        else {
            return i;
        }
    }
}
let _id = 0;
export function id() {
    return String(_id++);
}
export function loggableText(text) {
    return text.replace(/\n/g, '⏎').replace(/\t/g, '␉');
}
export function basename(p) {
    return p.match(/([^.\/]+)\.[A-z]+$/)?.[1] || p;
}
