import {beforeAll, beforeEach, describe, expect, it} from "vitest";
import {Workflow} from "../../src/domain/feature/workflow/workflow.feature";
import {Logger} from "../../src/domain/logger.port";
import {ConnectionType, WorkflowState} from "../../src/domain/feature/workflow/workflow.state.model";
import {NestPinoLogger} from "../../src/system/logger/nest-pino.logger";
import {PinoLogger} from "nestjs-pino";
import {pinoParams} from "../../src/infrastructure/logger/pino.params";
import {FakeConnectionManager} from "./fake-connection-manager.impl";

type Scenario = {
    data: {
        primaryStatus: boolean;
        backupStatus: boolean;
        fallbackStatus: boolean;
        fallbackConnection?: ConnectionType;
        expectedConnectionType: ConnectionType;
        description: string;
        resolved?: {
            primary?: number;
            backup?: number;
            fallback?: number;
        }
    };
}
describe('Workflow', () => {
    let workflow: Workflow;
    let state: WorkflowState;
    let connectionManager: FakeConnectionManager;
    let logger: Logger;

    const none = ConnectionType.NONE;
    const primary = ConnectionType.PRIMARY;
    const backup = ConnectionType.BACKUP;
    const fallback = ConnectionType.FALLBACK;

    beforeAll(() => {
        const pinoLogger = new PinoLogger(pinoParams);
        logger = new NestPinoLogger(pinoLogger);
        connectionManager = new FakeConnectionManager(logger);
        state = new WorkflowState();
        workflow = new Workflow(connectionManager, state, logger);
    });

    describe.each([none, primary, backup, fallback].map(initialConnection => ({
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

        const fallbackConnections = [undefined,ConnectionType.FALLBACK];

        const getDescription = (primaryStatus: boolean, backupStatus: boolean, fallbackStatus: boolean, fallbackConnection: ConnectionType | undefined, resolved?: Scenario['data']['resolved']) => `${primaryStatus ? '✅' : '❌'} / Backup ${backupStatus ? '✅' : '❌'} / Fallback ${fallbackStatus && fallbackConnection ? '✅' : '❌'} (fallbackConnection = ${fallbackConnection} fallbackStatus = ${fallbackStatus}) ${resolved ? `with resolved ${JSON.stringify(resolved)}` : ''})`;

        const scenarios: Scenario[] = fallbackConnections.flatMap(fallbackConnection => [                {
                get data() {
                    return {
                        primaryStatus: false,
                        backupStatus: false,
                        fallbackStatus: false,
                        fallbackConnection,
                        get expectedConnectionType(){
                            return initialConnection
                        },
                        get description(){
                            const expectedConnectionType = this.expectedConnectionType
                            return `Should ${expectedConnectionType === initialConnection ? 'keep' : 'change'} connection to ${expectedConnectionType} if Primary ${getDescription(this.primaryStatus, this.backupStatus, this.fallbackStatus, fallbackConnection)}`;
                        },
                    };
                }
            },{
                get data() {
                    return {
                        primaryStatus: true,
                        backupStatus: false,
                        fallbackStatus: false,
                        fallbackConnection,
                        get expectedConnectionType(){
                            return ConnectionType.PRIMARY
                        },
                        get description(){
                            const expectedConnectionType = this.expectedConnectionType
                            return `Should ${expectedConnectionType === initialConnection ? 'keep' : 'change'} connection to ${expectedConnectionType} if Primary ${getDescription(this.primaryStatus, this.backupStatus, this.fallbackStatus, fallbackConnection)}`;
                        },
                    };
                }
            },{
                get data() {
                    return {
                        primaryStatus: false,
                        backupStatus: true,
                        fallbackStatus: false,
                        fallbackConnection,
                        get expectedConnectionType(){
                            return ConnectionType.BACKUP
                        },
                        get description(){
                            const expectedConnectionType = this.expectedConnectionType
                            return `Should ${expectedConnectionType === initialConnection ? 'keep' : 'change'} connection to ${expectedConnectionType} if Primary ${getDescription(this.primaryStatus, this.backupStatus, this.fallbackStatus, fallbackConnection)}`;
                        },
                    };
                }
            },{
                get data() {
                    return {
                        primaryStatus: false,
                        backupStatus: false,
                        fallbackStatus: true,
                        fallbackConnection,
                        get expectedConnectionType(){
                            return this.fallbackStatus && fallbackConnection ? ConnectionType.FALLBACK : initialConnection
                        },
                        get description(){
                            const expectedConnectionType = this.expectedConnectionType
                            return `Should ${expectedConnectionType === initialConnection ? 'keep' : 'change'} connection to ${expectedConnectionType} if Primary ${getDescription(this.primaryStatus, this.backupStatus, this.fallbackStatus, fallbackConnection)}`;
                        },
                    };
                }
            },{
                get data() {
                    return {
                        primaryStatus: false,
                        backupStatus: false,
                        fallbackStatus: true,
                        fallbackConnection,
                        resolved:{
                            primary: 0,
                            backup: 2,
                            fallback: 1
                        },
                        get expectedConnectionType(){
                            return this.fallbackStatus && fallbackConnection && this.resolved.fallback < this.resolved.backup ? ConnectionType.FALLBACK : initialConnection
                        },
                        get description(){
                            const expectedConnectionType = this.expectedConnectionType
                            return `Should ${expectedConnectionType === initialConnection ? 'keep' : 'change'} connection to ${expectedConnectionType} if Primary ${getDescription(this.primaryStatus, this.backupStatus, this.fallbackStatus, fallbackConnection, this.resolved)}`;
                        },
                    };
                }
            },{
                get data() {
                    return {
                        primaryStatus: true,
                        backupStatus: true,
                        fallbackStatus: false,
                        fallbackConnection,
                        get expectedConnectionType(){
                            return ConnectionType.PRIMARY
                        },
                        get description(){
                            const expectedConnectionType = this.expectedConnectionType
                            return `Should ${expectedConnectionType === initialConnection ? 'keep' : 'change'} connection to ${expectedConnectionType} if Primary ${getDescription(this.primaryStatus, this.backupStatus, this.fallbackStatus, fallbackConnection)}`;
                        },
                    };
                }
            },{
                get data() {
                    return {
                        primaryStatus: true,
                        backupStatus: false,
                        fallbackStatus: true,
                        fallbackConnection,
                        get expectedConnectionType(){
                            return ConnectionType.PRIMARY
                        },
                        get description(){
                            const expectedConnectionType = this.expectedConnectionType
                            return `Should ${expectedConnectionType === initialConnection ? 'keep' : 'change'} connection to ${expectedConnectionType} if Primary ${getDescription(this.primaryStatus, this.backupStatus, this.fallbackStatus, fallbackConnection)}`;
                        },
                    };
                }
            },{
                get data() {
                    return {
                        primaryStatus: true,
                        backupStatus: false,
                        fallbackStatus: true,
                        fallbackConnection,
                        resolved:{
                            primary: 0,
                            backup: 3,
                            fallback: 1
                        },
                        get expectedConnectionType(){
                            return ConnectionType.PRIMARY
                        },
                        get description(){
                            const expectedConnectionType = this.expectedConnectionType
                            return `Should ${expectedConnectionType === initialConnection ? 'keep' : 'change'} connection to ${expectedConnectionType} if Primary ${getDescription(this.primaryStatus, this.backupStatus, this.fallbackStatus, fallbackConnection, this.resolved)}`;
                        },
                    };
                }
            },{
                get data() {
                    return {
                        primaryStatus: false,
                        backupStatus: true,
                        fallbackStatus: true,
                        fallbackConnection,
                        get expectedConnectionType(){
                            return initialConnection === ConnectionType.FALLBACK && this.fallbackStatus && this.fallbackConnection ? ConnectionType.FALLBACK : ConnectionType.BACKUP
                        },
                        get description(){
                            const expectedConnectionType = this.expectedConnectionType
                            return `Should ${expectedConnectionType === initialConnection ? 'keep' : 'change'} connection to ${expectedConnectionType} if Primary ${getDescription(this.primaryStatus, this.backupStatus, this.fallbackStatus, fallbackConnection)}`;
                        },
                    };
                }
            },{
                get data() {
                    return {
                        primaryStatus: false,
                        backupStatus: true,
                        fallbackStatus: true,
                        fallbackConnection,
                        resolved:{
                            primary: 0,
                            backup: 1,
                            fallback: 2
                        },
                        get expectedConnectionType(){
                            return initialConnection === ConnectionType.FALLBACK && this.fallbackStatus && this.fallbackConnection ? ConnectionType.FALLBACK : ConnectionType.BACKUP
                        },
                        get description(){
                            const expectedConnectionType = this.expectedConnectionType
                            return `Should ${expectedConnectionType === initialConnection ? 'keep' : 'change'} connection to ${expectedConnectionType} if Primary ${getDescription(this.primaryStatus, this.backupStatus, this.fallbackStatus, fallbackConnection, this.resolved)}`;
                        },
                    };
                }
            }]
        );

        it.each(scenarios)('$data.description', async ({ data: { primaryStatus, backupStatus, fallbackStatus, fallbackConnection, expectedConnectionType, resolved } }) => {
            connectionManager.connectionTestMapper[primary] = {healthy: primaryStatus, checkResolvedInMilisseconds: resolved?.primary || 0};
            connectionManager.connectionTestMapper[backup] = {healthy: backupStatus, checkResolvedInMilisseconds: resolved?.backup || 1};
            connectionManager.connectionTestMapper[fallback] = {healthy: fallbackStatus, checkResolvedInMilisseconds: resolved?.fallback || 2};

            await workflow.handler(primary, backup, fallbackConnection);

            expect(state.getCurrentConnectionState()).toEqual(expectedConnectionType);
        });
    });
});