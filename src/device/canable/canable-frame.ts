// NOTE: Copied, converted to TypeScript and modified from https://github.com/embedify/canable/blob/master/can-frame.js
export class CanableFrame {
    /*
        Example can frame:
        data: (5) [240, 255, 199, 14, 54]
        dlc: 5
        extendedId: true
        id: 83375105
    */
    // eslint-disable-next-line no-useless-constructor
    constructor(
        public readonly id: number,
        public readonly dlc: number,
        public readonly extendedId: boolean,
        public readonly data: Array<number>,
    ) {}

    /*
        Returns a string representation of the frame.
        @returns {string} example "4f83401"
    */
    public getHexId(): string {
        return this.id.toString(16);
    }
}
