export type DifferenceKind = 'same' | 'insertion' | 'deletion' | 'substitution';

export interface Difference<T> {
    kind: DifferenceKind,
    source?: T,
    target?: T
}

function editCost(e: DifferenceKind): number {
    return e === 'same' ? 0 : 1;
}


// Levenshtein distance (http://http://en.wikipedia.org/wiki/Levenshtein_distance)
export function getDifferences<T>(sourceList: T[], targetList: T[], same?: (a: T, b: T) => boolean): Difference<T>[] {
    if (!same) { same = (a, b) => a === b; }

    var sourceCount = sourceList.length;
    var targetCount = targetList.length;
    const edits: Difference<T>[][][] = [];
    const cost: number[][] = [];
    for (let i = 0; i < sourceCount + 1; i++) {
        edits[i] = [];
        cost[i] = [];
        for (let j = 0; j < targetCount + 1; j++) {
            edits[i][j] = [];
            cost[i][j] = 0;
        }
    }

    for (let i = 1; i <= sourceCount; i++) {
        edits[i][0] = edits[i - 1][0].concat({ kind: 'deletion', source: sourceList[i - 1] });
        cost[i][0] = i * editCost('deletion');
    }
    for (let j = 1; j <= targetCount; j++) {
        edits[0][j] = edits[0][j - 1].concat({ kind: 'insertion', target: targetList[j - 1] });
        cost[0][j] = j * editCost('insertion');
    }

    for (let j = 1; j <= targetCount; j++)
        for (let i = 1; i <= sourceCount; i++) {
            if (same(sourceList[i - 1], targetList[j - 1])) {
                edits[i][j] = edits[i - 1][j - 1].concat({ kind: 'same', source: sourceList[i - 1], target: targetList[j - 1] });
                cost[i][j] = cost[i - 1][j - 1] + editCost('same');
            }
            else {
                edits[i][j] = edits[i - 1][j].concat({ kind: 'deletion', source: sourceList[i - 1] });
                cost[i][j] = cost[i - 1][j] + editCost('deletion');

                if (cost[i][j - 1] < cost[i][j]) {
                    edits[i][j] = edits[i][j - 1].concat({ kind: 'insertion', target: targetList[j - 1] });
                    cost[i][j] = cost[i][j - 1] + editCost('insertion');
                }

                if (cost[i - 1][j - 1] < cost[i][j]) {
                    edits[i][j] = edits[i - 1][j - 1].concat({ kind: 'substitution', source: sourceList[i - 1], target: targetList[j - 1] });
                    cost[i][j] = cost[i - 1][j - 1] + editCost('substitution');
                }
            }
        }

    return edits[sourceCount][targetCount];
}
