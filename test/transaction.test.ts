import {
  BUILT_IN_DIALECTS,
  clearDatabase,
  destroyTest,
  initTest,
  insertPersons,
  TestContext,
  expect,
} from './test-setup'

for (const dialect of BUILT_IN_DIALECTS) {
  describe(`${dialect}: transaction`, () => {
    let ctx: TestContext

    before(async () => {
      ctx = await initTest(dialect)
    })

    beforeEach(async () => {
      await insertPersons(ctx, [
        {
          first_name: 'Jennifer',
          last_name: 'Aniston',
          gender: 'female',
          pets: [{ name: 'Catto', species: 'cat' }],
        },
        {
          first_name: 'Arnold',
          last_name: 'Schwarzenegger',
          gender: 'male',
          pets: [{ name: 'Doggo', species: 'dog' }],
        },
        {
          first_name: 'Sylvester',
          last_name: 'Stallone',
          gender: 'male',
          pets: [{ name: 'Hammo', species: 'hamster' }],
        },
      ])
    })

    afterEach(async () => {
      await clearDatabase(ctx)
    })

    after(async () => {
      await destroyTest(ctx)
    })

    it('should run multiple transactions in parallel', async () => {
      const threads = Array.from({ length: 100 }).map((_, index) => ({
        id: 1000000 + index + 1,
        fails: Math.random() < 0.5,
      }))

      const results = await Promise.allSettled(
        threads.map((thread) => executeThread(thread.id, thread.fails))
      )

      for (let i = 0; i < threads.length; ++i) {
        const [personExists, petExists] = await Promise.all([
          doesPersonExists(threads[i].id),
          doesPetExists(threads[i].id),
        ])

        if (threads[i].fails) {
          expect(personExists).to.equal(false)
          expect(petExists).to.equal(false)
          expect(results[i].status === 'rejected')
        } else {
          expect(personExists).to.equal(true)
          expect(petExists).to.equal(true)
          expect(results[i].status === 'fulfilled')
        }
      }

      async function executeThread(id: number, fails: boolean): Promise<void> {
        await ctx.db.transaction(async () => {
          await insertPerson(id)

          await new Promise<void>((resolve) => {
            // Use a setTimeout to make sure the async hooks are used
            // properly and even the query executed from the setTimeout
            // callback gets the correct transaction.
            setTimeout(() => {
              insertPet(id).then(resolve)
            }, 2)
          })

          if (fails) {
            throw new Error()
          }
        })
      }

      async function insertPet(ownerId: number): Promise<void> {
        await ctx.db
          .insertInto('pet')
          .values({ name: `Pet of ${ownerId}`, owner_id: ownerId })
          .execute()
      }

      async function insertPerson(id: number): Promise<void> {
        await ctx.db
          .insertInto('person')
          .values({ id, first_name: `Person ${id}` })
          .execute()
      }

      async function doesPersonExists(id: number): Promise<boolean> {
        return !!(await ctx.db
          .selectFrom('person')
          .where('id', '=', id)
          .where('first_name', '=', `Person ${id}`)
          .executeTakeFirst())
      }

      async function doesPetExists(ownerId: number): Promise<boolean> {
        return !!(await ctx.db
          .selectFrom('pet')
          .where('owner_id', '=', ownerId)
          .where('name', '=', `Pet of ${ownerId}`)
          .executeTakeFirst())
      }
    })
  })
}