import { parse } from 'node:path';
import {
    CanOperation,
    DeviceNetworkId,
    ParsedCanFrame,
} from '../../types/BafangCanCommonTypes';
import {
    generateCanFrameId,
    parseCanFrame,
} from '../high-level/bafang-can-utils';
import { CanFrame } from './can-types';

/*
    Class for handling incomming CAN frames
*/
export class CanIncommingFrameHandler {
    private readonly mutliFrameBuffer: {
        [key: string]: {
            startFrames: CanFrame[];
            dataFrames: CanFrame[];
        };
    } = {};

    // eslint-disable-next-line no-useless-constructor
    constructor(private readonly sendFrame: (frame: CanFrame) => any) {
        //
    }

    public processCanFrame(canFrame: CanFrame): Promise<CanFrame | null> {
        return new Promise((resolve, reject) => {
            const parsedCanFrame: ParsedCanFrame = parseCanFrame(canFrame);

            // Check if received frame is a multiframe, if so process it in the CanMultiFrame class
            if (
                parsedCanFrame.canOperationCode >=
                    CanOperation.MULTIFRAME_START &&
                parsedCanFrame.canOperationCode <=
                    CanOperation.MULTIFRAME_WARNING
            ) {
                // Only process multiframe if the target device is the BESST (this device)
                if (parsedCanFrame.targetDeviceCode === DeviceNetworkId.BESST) {
                    this.processMultiFrame(canFrame, parsedCanFrame)
                        .then((frame) => {
                            resolve(frame);
                            return frame;
                        })
                        .catch((error) => {
                            reject(error);
                        });
                }
                return; // The processMultiFrame function will resolve or reject the promise
            }
            switch (parsedCanFrame.canOperationCode) {
                case CanOperation.WRITE_CMD:
                    // console.log('[canbus]WRITE_CMD: ', parsedCanFrame);
                    break;
                case CanOperation.READ_CMD:
                    console.log('[canbus]READ_CMD: ', parsedCanFrame);
                    break;
                case CanOperation.NORMAL_ACK:
                    // if (
                    //     parsedCanFrame.targetDeviceCode ===
                    //     DeviceNetworkId.BESST
                    // ) {
                    //     console.error('[canbus]NORMAL_ACK: ', parsedCanFrame);
                    // }
                    break;
                case CanOperation.ERROR_ACK:
                    if (
                        parsedCanFrame.targetDeviceCode ===
                        DeviceNetworkId.BESST
                    ) {
                        console.error('[canbus]ERROR_ACK: ', parsedCanFrame);
                    }
                    break;
                default:
                    console.error('Unknown operation code: ', parsedCanFrame);
            }
            resolve(canFrame);
        });
    }

    /*
        Process a multiframe.
        If the frame is a start frame, a new buffer is created.
        If the frame is a middle frame, it is added to the buffer.
        If the frame is an end frame, the buffer is processed.

        @Returns a promise that resolves with the original frame if the frame is an end frame.
        @Returns a promise that resolves with null if the frame is a start or middle frame.
    */
    private processMultiFrame(
        originalCanFrame: CanFrame,
        parsedCanFrame: ParsedCanFrame,
    ): Promise<CanFrame | null> {
        return new Promise((resolve, reject) => {
            const multiFrameId = this.generateMultiframeId(parsedCanFrame);
            switch (parsedCanFrame.canOperationCode) {
                case CanOperation.MULTIFRAME_START:
                    console.log(
                        `[canbus->${parsedCanFrame.sourceDeviceCode}=${parsedCanFrame.data[0]}]Multiframe start`,
                        // originalCanFrame,
                        parsedCanFrame,
                    );

                    // Create a new buffer for the multiframe
                    // We don't add the first frame to the buffer. The first frame only contains to total length of the data
                    if (this.mutliFrameBuffer[multiFrameId] === undefined) {
                        this.mutliFrameBuffer[multiFrameId] = {
                            startFrames: [],
                            dataFrames: [],
                        };
                    }
                    this.mutliFrameBuffer[multiFrameId].startFrames.push(
                        originalCanFrame,
                    );
                    this.ackCanFrame(originalCanFrame, parsedCanFrame);
                    break;
                case CanOperation.MULTIFRAME:
                    console.log(
                        `[canbus->${parsedCanFrame.sourceDeviceCode}->${parsedCanFrame.canCommandSubCode}]Multiframe middle`,
                        // originalCanFrame,
                        parsedCanFrame,
                        JSON.parse(
                            JSON.stringify(
                                this.mutliFrameBuffer[multiFrameId].startFrames,
                            ),
                        ),
                    );
                    // Add the frame to the buffer
                    if (this.mutliFrameBuffer[multiFrameId] === undefined) {
                        reject(
                            new Error(
                                '[canbus]Received a middle frame without a registered start frame',
                            ),
                        );
                        return; // Stop acking the frame
                    }
                    this.mutliFrameBuffer[multiFrameId].dataFrames.push(
                        originalCanFrame,
                    );

                    // Some controllers send multiple middle frames in one sequence, we check if the multiframe is complete
                    resolve(this.checkIfMultiFrameIsComplete(originalCanFrame));
                    this.ackCanFrame(originalCanFrame, parsedCanFrame);
                    return;

                case CanOperation.MULTIFRAME_END:
                    console.log(
                        `[canbus->${parsedCanFrame.sourceDeviceCode}->${parsedCanFrame.canCommandSubCode}]Multiframe end`,
                        // originalCanFrame,
                        parsedCanFrame,
                    );
                    // Combine the data of all frames in the buffer
                    if (this.mutliFrameBuffer[multiFrameId] === undefined) {
                        reject(
                            new Error(
                                '[canbus]Received a end frame without a registered start frame',
                            ),
                        );
                        return; // Stop acking the frame
                    }

                    this.mutliFrameBuffer[multiFrameId].dataFrames.push(
                        originalCanFrame,
                    );
                    // Set the data of the original frame to the combined data, Always clear this sequence after receiving the end frame
                    resolve(
                        this.getMultiFrameBufferForEndingFrame(
                            originalCanFrame,
                        ),
                    );
                    return; // return to prevent the ackCanFrame from being called

                case CanOperation.MULTIFRAME_WARNING:
                    console.error(
                        `[canbus->${parsedCanFrame.sourceDeviceCode}]Multiframe warning`,
                        parsedCanFrame,
                    );
                    break;
                default:
                    console.error(
                        '[canbus]Unknown multiframe operation code: ',
                        parsedCanFrame,
                    );
            }

            // this.ackCanFrame(originalCanFrame, parsedCanFrame);
            resolve(null);
        });
    }

    private checkIfMultiFrameIsComplete(
        originalCanFrame: CanFrame,
    ): CanFrame | null {
        const firstFrame = this.getFirstCanFrameOfMultiFrame(originalCanFrame);
        const frameBufferId = this.generateMultiframeId(
            parseCanFrame(originalCanFrame),
        );
        // Check if the buffer is complete by checking if the total length of the data is received
        const bufferLength = this.getCurrentBufferLength(frameBufferId);
        if (bufferLength >= firstFrame.data[0]) {
            // Remove this first frame since it is complete
            const canFrame = this.getMultiFrameBuffer(
                originalCanFrame,
                true,
                false,
            );
            this.mutliFrameBuffer[frameBufferId].startFrames.shift();
            return canFrame;
        }
        return null;
    }

    private getMultiFrameBufferForEndingFrame(
        originalCanFrame: CanFrame,
    ): CanFrame | null {
        const frameBufferId = this.generateMultiframeId(
            parseCanFrame(originalCanFrame),
        );
        let bufferLength = this.getCurrentBufferLength(frameBufferId);
        const { startFrames } = this.mutliFrameBuffer[frameBufferId];
        const lastStartFrame = startFrames[startFrames.length - 1];
        console.log('start frames', startFrames);
        if (startFrames.length === 0) {
            // Clear buffer and return null if no start frames are found
            delete this.mutliFrameBuffer[frameBufferId];
            return null;
        }

        // first check if the current buffer matches the first frame, if not check if the buffer matches the last frame
        if (bufferLength === startFrames[0].data[0]) {
            return this.getMultiFrameBuffer(originalCanFrame, true, true);
        }
        if (bufferLength === lastStartFrame.data[0]) {
            // Set the start frame to the last frame for buffer check
            this.mutliFrameBuffer[frameBufferId].startFrames = [lastStartFrame];
            return this.getMultiFrameBuffer(originalCanFrame, true, true);
        }
        // If the buffer is higher than the last frame, try and repair the buffer by removing first data frames until buffer matches
        // This assumes that the last received start frame is the correct one
        while (bufferLength > lastStartFrame.data[0]) {
            this.mutliFrameBuffer[frameBufferId].dataFrames.shift();
            bufferLength = this.getCurrentBufferLength(frameBufferId);
            if (bufferLength === lastStartFrame.data[0]) {
                this.mutliFrameBuffer[frameBufferId].startFrames = [
                    lastStartFrame,
                ];
                return this.getMultiFrameBuffer(originalCanFrame, true, true);
            }
        }
        // clear buffer and return null
        delete this.mutliFrameBuffer[frameBufferId];
        return null;
    }

    private getCurrentBufferLength(frameBufferId: string): number {
        return this.mutliFrameBuffer[frameBufferId].dataFrames.reduce(
            (totalLength, frame) => totalLength + frame.data.length,
            0,
        );
    }

    /*
        Get the buffer of all multiframes and clear the buffer
        @Returns the buffer of the multiframe
    */
    private getMultiFrameBuffer(
        originalCanFrame: CanFrame,
        deleteBuffer: boolean,
        deleteMultiframeSequence: boolean,
    ): CanFrame {
        const buffer: number[] = [];
        const firstFrame = this.getFirstCanFrameOfMultiFrame(originalCanFrame);
        const frameBufferId = this.generateMultiframeId(
            parseCanFrame(originalCanFrame),
        );
        this.mutliFrameBuffer[frameBufferId].dataFrames.forEach((frame) => {
            buffer.push(...frame.data);
        });
        if (deleteBuffer) {
            this.mutliFrameBuffer[frameBufferId].dataFrames = [];
        }
        if (deleteMultiframeSequence) {
            delete this.mutliFrameBuffer[frameBufferId];
        }
        const canFrame: CanFrame = {
            id: firstFrame.id,
            data: buffer,
        };
        // this.triggerNextQueueFrame(frameBufferId);

        // Check if all data is received (the first frame contains the total length of the data)
        const success = buffer.length === firstFrame.data[0];
        const parsedFirstFrame = parseCanFrame(firstFrame);
        console.log(
            `[canbus->${parsedFirstFrame.sourceDeviceCode}]Finished building multi frame ${success ? 'SUCCESS' : `FAILED${buffer.length}/${firstFrame.data[0]}`}`,
            canFrame,
        );
        return canFrame;
    }

    private getFirstCanFrameOfMultiFrame(originalCanFrame: CanFrame): CanFrame {
        return this.mutliFrameBuffer[
            this.generateMultiframeId(parseCanFrame(originalCanFrame))
        ]?.startFrames[0];
    }

    // Generate a unique id for a multiframe buffer (used as key in the mutliFrameBuffer object)
    private generateMultiframeId(parsedCanFrame: ParsedCanFrame): string {
        return `${parsedCanFrame.sourceDeviceCode}-${parsedCanFrame.targetDeviceCode}}`;
    }

    /*
        Acknowledge a frame by sending an ack frame
    */
    private ackCanFrame(
        originalCanFrame: CanFrame,
        parsedCanFrame: ParsedCanFrame,
    ): void {
        const firstFrame = this.getFirstCanFrameOfMultiFrame(originalCanFrame);
        const parsedFirstFrame = parseCanFrame(firstFrame);
        // console.log(
        //     `[canbus->${parsedCanFrame.sourceDeviceCode}]Acknowledge frame for ${parsedFirstFrame.sourceDeviceCode}->${parsedFirstFrame.canCommandSubCode}`,
        // );
        // Rebuild Id
        const frameId = generateCanFrameId(
            DeviceNetworkId.BESST,
            parsedFirstFrame.sourceDeviceCode,
            CanOperation.NORMAL_ACK,
            parsedFirstFrame.canCommandCode,
            parsedFirstFrame.canCommandSubCode,
        );
        const ackFrame: CanFrame = {
            id: frameId,
            data: [0], // firstFrame.data,
        };
        this.sendFrame(ackFrame);
    }
}
