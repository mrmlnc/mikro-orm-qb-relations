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

	const [[tcr]] = await Promise.all([
		testCaseRevisionRepository.createQueryBuilder('t0')
			.select('*')
			.innerJoinAndSelect('t0.testCase', 't1', { version: sql`t0.version` })
			.innerJoinAndSelect('t1.priority', 't2')
			.getResultList(),
		testCasePriorityRepository.findAll(),
	]);

	assert.strictEqual(tcr.priority.id, 1);
	assert.strictEqual(tcr.priority.name, 'draft');

	const actual = wrap(tcr).toJSON();

	console.dir(actual, { colors: true, compact: false, depth: 2 });

	assert.strictEqual(actual.priority.id, 1);
	assert.strictEqual(actual.priority.name, 'draft');
});
