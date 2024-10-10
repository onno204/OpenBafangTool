import { EventEmitter } from 'events';
import {
    CanOperation,
    DeviceNetworkId,
    ParsedCanFrame,
} from '../../types/BafangCanCommonTypes';
import IGenericCanAdapter from '../can/generic';
import { SerialPort } from 'serialport';
import { AutoDetectTypes } from '@serialport/bindings-cpp';
import { PromiseControls } from '../../types/common';
import {
    CanableCommands,
    CanableWritePacket,
    getCanableCommandInterval,
    getCanableCommandTimeout,
} from './canable-types';
import { CanFrame } from '../can/can-types';
import { CanablePort } from './canable-port';
import { CANFrame } from './canable-frame';
import { parseCanFrame } from '../high-level/bafang-can-utils';

export async function listCanableDevices(): Promise<string[]> {
    return (await SerialPort.list())
        .filter(
            (port) =>
                port.vendorId === 'AD50' &&
                ['60C5', '60C4'].includes(port.productId ?? ''),
        )
        .map((port) => port.path);
}

class CanableDevice implements IGenericCanAdapter {
    private path: string;

    private device?: SerialPort<AutoDetectTypes>;

    private CanablePort?: CanablePort;

    public readonly emitter: EventEmitter;

    private serialReadBuffer: number[] = [];

    private versionPromise?: PromiseControls;

    private packetQueue: CanableWritePacket[] = [];

    private lastMultiframeCanResponse: {
        [key: number]: ParsedCanFrame;
    } = [];

    constructor(path: string) {
        this.path = path;
        this.processReadedData = this.processReadedData.bind(this);
        this.processWriteQueue = this.processWriteQueue.bind(this);
        // this.processCanFrame = this.processCanFrame.bind(this);
        this.connect = this.connect.bind(this);
        this.sendCanFrame = this.sendCanFrame.bind(this);
        this.sendCanFrameImmediately = this.sendCanFrameImmediately.bind(this);
        this.getVersion = this.getVersion.bind(this);
        this.disconnect = this.disconnect.bind(this);
        this.emitter = new EventEmitter();
    }

    private processWriteQueue(): void {
        if (this.packetQueue.length === 0) {
            setTimeout(this.processWriteQueue, 100);
            return;
        }
        const packet = this.packetQueue.shift() as CanableWritePacket;
        let bytes: number[] = [packet.type];
        if (packet.type === CanableCommands.VERSION) {
            setTimeout(() => {
                this.versionPromise?.reject();
                this.versionPromise = undefined;
            }, getCanableCommandTimeout(packet.type));
        } else if (packet.type === CanableCommands.FRAME && packet.frame) {
            bytes.push((packet.frame.data.length & 0xf) + 0x30);
            packet.frame.id.forEach((value) => {
                bytes.push(((value & 0xf0) >> 4) + 0x30);
                bytes.push((value & 0xf) + 0x30);
            });
            packet.frame.data.forEach((value) => {
                bytes.push(((value & 0xf0) >> 4) + 0x30);
                bytes.push((value & 0xf) + 0x30);
            });
        }
        bytes.push(0x0a);
        packet.promise?.resolve();
        try {
            // log.info('sent besst package:', packet.data);
            console.log('Attempting to write:', bytes, packet);
            // this.device?.write(bytes);
            // this.CanablePort?.send({
            //     id: 1,
            //     extendedId: true,
            //     dlc: 8,
            //     data: [1, 2, 3, 4, 5, 6, 7, 8],
            // });
        } catch (e) {
            console.log('write error:', e);
            // this.onDisconnect();
        }
        setTimeout(
            this.processWriteQueue,
            getCanableCommandInterval(packet.type) + 10,
        );
    }

    private processReadedData(data: Uint8Array): void {
        // console.log('Raw data:', data);

        // this.serialReadBuffer = [...this.serialReadBuffer, ...data];

        // // Wait for a full command to be received
        // if (this.serialReadBuffer.indexOf(0x0a) === -1) return;
        // let cmd = this.serialReadBuffer.splice(
        //     0,
        //     this.serialReadBuffer.indexOf(0x0a) + 1,
        // );
        let cmd = data;
        let cmdData = cmd.slice(1, cmd.length - 1).map((byte) => byte - 0x30);

        console.log('Raw cmd:', cmd);
        switch (cmd[0]) {
            case 0x20:
                let length = cmdData[0];
                let frame_id: number[] = [
                    (cmdData[1] << 4) + cmdData[2],
                    (cmdData[3] << 4) + cmdData[4],
                    (cmdData[5] << 4) + cmdData[6],
                    (cmdData[7] << 4) + cmdData[8],
                ];
                let frame_data: number[] = [];
                cmdData.slice(9, cmdData.length).forEach((value, index) => {
                    index % 2 == 0
                        ? frame_data.push(value)
                        : (frame_data[frame_data.length - 1] =
                              (frame_data[frame_data.length - 1] << 4) + value);
                });
                if (frame_data.length !== length) {
                    console.log('Error (length)');
                    break;
                }
                console.log('Got frame:', length, frame_id, frame_data);
                this.emitter.emit('can', {
                    id: frame_id,
                    data: frame_data,
                });
                break;
            case 0x40:
                console.log('Error');
                break;
            case 0xff:
                if (cmdData.length !== 6) this.versionPromise?.reject();
                let version: number[] = [
                    (cmdData[0] << 4) + cmdData[1],
                    (cmdData[2] << 4) + cmdData[3],
                    (cmdData[4] << 4) + cmdData[5],
                ];
                this.versionPromise?.resolve(version);
                this.versionPromise = undefined;
                break;
            default:
                break;
        }
    }

    public async connect(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            console.log(this.path);
            // To prevent multiple connections to the same COM port, we check if there is already a port connected in this class
            if (this.CanablePort) {
                console.log(
                    'There is already a port connected, ignoring connect request',
                );
                resolve();
                return;
            }
            this.CanablePort = new CanablePort(this.path);
            this.CanablePort.open((error) => (error ? reject(error) : 0));
            this.CanablePort.setBitRate(250000);
            this.CanablePort.on('data', this.processFrame.bind(this));

            this.CanablePort.on('open', () => {
                this.packetQueue.push({
                    type: CanableCommands.OPEN,
                });
                resolve();
            });

            setTimeout(this.processWriteQueue, 100);
        });
    }

    private processFrame(frame: CANFrame): void {
        // Split the original hex id into 4 bytes
        const hexFirstChar = frame.hexId[0];
        const hexRemaining = frame.hexId.slice(1);
        const frameId = [hexFirstChar, ...hexRemaining.match(/.{2}/g)].map(
            (byte) => parseInt(byte, 16),
        );

        const canFrame: CanFrame = {
            id: frameId,
            data: frame.data,
        };
        this.emitter.emit('can', canFrame);
        // const parsedCanFrame: ParsedCanFrame = parseCanFrame(canFrame);
        // console.log('parsedCanFrame: ', parsedCanFrame);
    }

    public getVersion(): Promise<number[]> {
        return new Promise<number[]>((resolve, reject) => {
            this.packetQueue.push({
                type: CanableCommands.VERSION,
            });
            this.versionPromise = { resolve, reject };
        });
    }

    public testConnection(): Promise<boolean> {
        return new Promise<boolean>(async (resolve, reject) => {
            // if (!this.CanablePort) await this.connect();
            // this.getVersion()
            //     .then((version) => {
            //         console.log(version);
            //         resolve(true);
            //     })
            //     .catch(reject);
            resolve(true);
        });
    }

    public sendCanFrame(frame: CanFrame): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            console.log('Should write frame but blocked: ', frame);
            resolve();
            // this.packetQueue.push({
            //     type: CanableCommands.FRAME,
            //     frame,
            //     promise: { resolve, reject },
            // });
        });
    }

    public sendCanFrameImmediately(frame: CanFrame): Promise<void> {
        return new Promise<void>((resolve, reject) => {});
    }

    public disconnect(): void {
        this.device?.close();
        this.CanablePort?.close();
    }
}

export default CanableDevice;
