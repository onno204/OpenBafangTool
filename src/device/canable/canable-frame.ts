// NOTE: copied from https://github.com/embedify/canable/blob/master/can-frame.js  and converted to TypeScript
export class CANFrame {
    public hexId;

    public id;

    public dlc;

    public extendedId;

    public data;

    constructor({ hexId, id, dlc, extendedId, data }) {
        this.hexId = hexId;
        this.id = id;
        this.dlc = dlc;
        this.extendedId = extendedId;
        this.data = data;
    }
}
