/**
 * R2 service-instance selection and fixed resource inventory.
 * One retained row per tenant-scoped service definition; the semantic owner
 * validates canonical state and its bounds. SQL defaults must mint no authority.
 */
import {SERVICE_INSTANCE_COLUMN as COLUMN} from '../constants/service-instance.js';
import {
  COLUMN_TYPE,
  SYSTEM_TABLE_NAME,
} from './system-table-schema-shared-constants.js';

const SERVICE_INSTANCES_SCHEMA = {
  tableName: SYSTEM_TABLE_NAME.SERVICE_INSTANCES,
  columns: [
    {name: COLUMN.SERVICE_ID, type: COLUMN_TYPE.TEXT, primaryKey: true, notNull: true},
    {name: COLUMN.FORMAT, type: COLUMN_TYPE.INTEGER, notNull: true},
    {name: COLUMN.STATE, type: COLUMN_TYPE.TEXT, notNull: true},
  ],
};

export {SERVICE_INSTANCES_SCHEMA};
