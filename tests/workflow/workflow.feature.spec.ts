import {beforeAll, beforeEach, describe, expect, it} from "vitest";
import {Workflow} from "../../src/domain/feature/workflow/workflow.feature";
import {Logger} from "../../src/domain/logger.port";
import {ConnectionType, WorkflowState} from "../../src/domain/feature/workflow/workflow.state.model";
import {NestPinoLogger} from "../../src/system/logger/nest-pino.logger";
import {PinoLogger} from "nestjs-pino";
import {pinoParams} from "../../src/infrastructure/logger/pino.params";
import {FakeConnectionManager} from "./fake-connection-manager.impl";

describe('Workflow', () => {
    let workflow: Workflow;
    let state: WorkflowState;
    let connectionManager: FakeConnectionManager;
    let logger: Logger;

    const primary = ConnectionType.PRIMARY;
    const backup = ConnectionType.BACKUP;

    beforeAll(() => {
        const pinoLogger = new PinoLogger(pinoParams);
        logger = new NestPinoLogger(pinoLogger);
        connectionManager = new FakeConnectionManager(logger);
        state = new WorkflowState(logger);
        workflow = new Workflow(connectionManager, state, logger);
    });

    describe.each([ConnectionType.NONE, ConnectionType.PRIMARY,ConnectionType.BACKUP].map(initialConnection => ({
        get data(){
            return {
                description: `Connection is ${initialConnection}`,
                initialConnection
            };
        }
    })))('$data.description', ({data:{initialConnection}}) => {
        beforeEach(async () => {
            connectionManager.reset();
            state.setMainConnection(initialConnection);
        });

        const scenarios = [
            {
                get data() {
                    const expectedConnectionState = initialConnection
                    return {
                        description: `Should ${expectedConnectionState === initialConnection ? 'keep' : 'change'} connection to ${expectedConnectionState} if neither PRIMARY or BACKUP are up`,
                        primaryStatus: false,
                        backupStatus: false,
                        expectedConnectionState,
                    };
                }
            },
            {
                get data() {
                    const expectedConnectionState = ConnectionType.PRIMARY;
                    return {
                        description: `Should ${expectedConnectionState === initialConnection ? 'keep' : 'change'} connection to ${expectedConnectionState} if primary only is up`,
                        primaryStatus: true,
                        backupStatus: false,
                        expectedConnectionState,
                    };
                }
            },
            {
                get data() {
                    const expectedConnectionState = ConnectionType.BACKUP;
                    return {
                        description: `Should ${expectedConnectionState === initialConnection ? 'keep' : 'change'} connection to ${expectedConnectionState} if backup only is up`,
                        primaryStatus: false,
                        backupStatus: true,
                        expectedConnectionState,
                    };
                }
            },
            {
                get data() {
                    const expectedConnectionState = ConnectionType.PRIMARY;
                    return {
                        description: `Should ${expectedConnectionState === initialConnection ? 'keep' : 'change'} connection to ${expectedConnectionState} if both primary and backup are up`,
                        primaryStatus: true,
                        backupStatus: true,
                        expectedConnectionState,
                    };
                }
            },
        ];

        it.each(scenarios)('$data.description', async ({ data: { primaryStatus, backupStatus, expectedConnectionState } }) => {
            connectionManager.connectionTestMapper[primary] = primaryStatus;
            connectionManager.connectionTestMapper[backup] = backupStatus;

            await workflow.handler(primary, backup);

            expect(state.getCurrentConnectionState()).toEqual(expectedConnectionState);
        });
    });
});