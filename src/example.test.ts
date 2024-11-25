import * as assert from 'assert';

import {
	Collection,
	Entity,
	ManyToOne,
	OneToMany,
	OptionalProps,
	PrimaryKey,
	PrimaryKeyProp,
	Property,
	types as PropertyType,
	Rel,
	wrap,
	sql,
	serialize,
} from '@mikro-orm/core';
import { MikroORM } from '@mikro-orm/sqlite';

@Entity({ abstract: true })
abstract class TestCaseFieldsEntity {
	@ManyToOne(() => TestCasePriorityEntity, {
		type: PropertyType.integer,
		eager: true
	})
	priority!: Rel<TestCasePriorityEntity>;
}

@Entity({
	tableName: 'test_case',
})
class TestCaseEntity extends TestCaseFieldsEntity {
	@PrimaryKey()
	id!: number;

	@OneToMany(() => 'TestCaseRevisionEntity', 'testCase', { hidden: true, orphanRemoval: true })
	revisions = new Collection<TestCaseRevisionEntity>(this);

	@Property({ version: true })
	version!: number;
}

@Entity({
	tableName: 'test_case_revision',
})
class TestCaseRevisionEntity extends TestCaseFieldsEntity {
	@PrimaryKey()
	id!: number;

	@ManyToOne(() => TestCaseEntity, { hidden: true })
	testCase!: Rel<TestCaseEntity>;

	@Property()
	version!: number;
}

@Entity({
	tableName: 'test_case_priority',
})
class TestCasePriorityEntity {
	@PrimaryKey()
	id!: number;

	@Property()
	name!: string;
}

let orm: MikroORM;

beforeAll(async () => {
	orm = await MikroORM.init({
		dbName: ':memory:',
		entities: [TestCaseEntity, TestCasePriorityEntity, TestCaseRevisionEntity],
		debug: ['query', 'query-params'],
		allowGlobalContext: true,
		implicitTransactions: false
	});

	await orm.schema.refreshDatabase();
});

afterAll(async () => {
	await orm.close(true);
});

it('test', async () => {
	const testCaseRepository = orm.em.getRepository(TestCaseEntity);
	const testCaseRevisionRepository = orm.em.getRepository(TestCaseRevisionEntity);
	const testCasePriorityRepository = orm.em.getRepository(TestCasePriorityEntity);

	await orm.em.insert(TestCasePriorityEntity, { name: 'draft' });
	await orm.em.insert(TestCaseEntity, { priority: 1, version: 1 });
	await orm.em.insert(TestCaseRevisionEntity, { priority: 1, testCase: 1, version: 1 })

	orm.em.clear();

	const [[tcr], priorities] = await Promise.all([
		testCaseRevisionRepository.createQueryBuilder('t0')
			.select('*')
			.innerJoinAndSelect('t0.testCase', 't1', { version: sql`t0.version` })
			.innerJoinAndSelect('t1.priority', 't2')
			.getResultList(),
		testCasePriorityRepository.findAll(),
	]);

	assert.strictEqual(tcr.priority.id, 1);
	assert.strictEqual(tcr.priority.name, 'draft');
	assert.ok(tcr.priority === priorities[0]);

	// Works correctly
	const serialized = serialize(tcr, { populate: ['priority'] });

	assert.strictEqual(serialized.priority.id, 1);
	assert.strictEqual(serialized.priority.name, 'draft');

	// Works correctly
	const pojo = wrap(tcr).toPOJO();

	assert.strictEqual(pojo.priority.id, 1);
	assert.strictEqual(pojo.priority.name, 'draft');

	// Broken
	const json = wrap(tcr).toJSON();

	assert.strictEqual(json.priority.id, 1);
	assert.strictEqual(json.priority.name, 'draft');
});
