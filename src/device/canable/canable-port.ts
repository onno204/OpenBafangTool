// NOTE: Copied from https://github.com/embedify/canable/blob/master/can-port.js and converted to TypeScript
import { SerialPort } from 'serialport';
import { EventEmitter } from 'events';
import { CANFrame } from './canable-frame';

function stringForEach(data: string, callback) {
    for (let i = 0; i < data.length; i++) {
        callback(data.charAt(i));
    }
}

function printHexString(number, padding): string {
    const stringyNumber = number.toString(16);

    if (stringyNumber.length < padding) {
        return '0'.repeat(padding - stringyNumber.length) + stringyNumber;
    }
    return stringyNumber;
}

export class CanablePort extends EventEmitter {
    public static currentActivePort: CanablePort? = null;

    private serialPort: SerialPort;

    private frameBuffer: [];

    constructor(path: string) {
        super();
        this.serialPort = new SerialPort({
            path,
            baudRate: 250000, // Required bitrate for Bafang devices is 250k
            autoOpen: false,
        });
        this.frameBuffer = [];
        this.send.bind(this);
        CanablePort.currentActivePort = this;
    }

    open(cb?: (error: Error | null | undefined) => void) {
        // If there is an active port, close it before opening a new one
        if (CanablePort.currentActivePort) {
            CanablePort.currentActivePort.close(() => {
                this.open(cb);
            });
            return;
        }

        // Factory function to create a handler for the 'data' event
        function handlerFactory(self) {
            return function handleNewData(data) {
                data = data.toString();
                stringForEach(data, (char) => {
                    switch (char) {
                        case 't': // SOF
                        case 'T':
                            self.frameBuffer = char;
                            break;
                        case '\r': // EOF
                            self.emit(
                                'data',
                                self.processStringyFrame(self.frameBuffer),
                            );
                            break;
                        default: // Frame data
                            self.frameBuffer += char;
                            break;
                    }
                });
            };
        }

        // Open the serial port
        this.serialPort.open(cb);
        this.serialPort.on('data', handlerFactory(this));
        this.serialPort.on('open', () => this.emit('open'));
        this.serialPort.write('O\r', cb);
    }

    close(cb?: () => void) {
        this.serialPort.write('C\r');
        this.serialPort.close(() => {
            CanablePort.currentActivePort = null;
            if (cb) {
                cb();
            }
        });
    }

    send(message) {
        let stringyFrame = '';

        if (message.extendedId) {
            stringyFrame += `T${printHexString(message.id, 8)}`;
        } else {
            stringyFrame += `t${printHexString(message.id, 4)}`;
        }

        stringyFrame += message.dlc.toString(16);

        for (let i = 0; i < message.dlc; i++) {
            stringyFrame += printHexString(message.data[i], 2);
        }

        stringyFrame += '\r';

        console.log(stringyFrame);

        this.serialPort.write(stringyFrame);
    }

    setBitRate(rate: number) {
        switch (rate) {
            case 10000:
                this.serialPort.write('S0\r');
                break;
            case 20000:
                this.serialPort.write('S1\r');
                break;
            case 50000:
                this.serialPort.write('S2\r');
                break;
            case 100000:
                this.serialPort.write('S3\r');
                break;
            case 125000:
                this.serialPort.write('S4\r');
                break;
            case 250000:
                this.serialPort.write('S5\r');
                break;
            case 500000:
                this.serialPort.write('S6\r');
                break;
            case 750000:
                this.serialPort.write('S7\r');
                break;
            case 1000000:
                this.serialPort.write('S8\r');
                break;
            default:
                throw new Error('Unsupported bit rate');
        }
    }

    // Private functions
    processStringyFrame(stringyFrame: string): CANFrame | null {
        let idLength;
        let extended;

        switch (stringyFrame.charAt(0)) {
            case 'T': // Extended ID
                idLength = 8;
                extended = true;
                break;
            case 't': // Standard ID
                idLength = 4;
                extended = false;
                break;
            default:
                // Error case
                this.emit(
                    'error',
                    `Unknwon message type from CANable received\rMessage: ${stringyFrame}`,
                );
                return null; // No further processing required
        }

        const id = parseInt(stringyFrame.slice(1, 1 + idLength), 16);
        const dlc = parseInt(
            stringyFrame.slice(1 + idLength, 2 + idLength),
            16,
        );
        const data = [];

        for (let i = 0; i < dlc; i++) {
            data.push(
                parseInt(
                    stringyFrame.slice(
                        2 + idLength + 2 * i,
                        4 + idLength + 2 * i,
                    ),
                    16,
                ),
            );
        }

        return new CANFrame({
            hexId: id.toString(16),
            id,
            dlc,
            extendedId: extended,
            data,
        });
    }
}
