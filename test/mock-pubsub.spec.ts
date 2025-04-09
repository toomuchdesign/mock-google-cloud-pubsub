require('dotenv-haphap').config('confidential.env');
import waitForExpect from 'wait-for-expect';
import { PubSub, type Message } from '@google-cloud/pubsub';
import { PubSub as MockPubSub } from '../src/mock-pubsub';
import { delay } from '../src/utils';

const prefix = process.env.RESOURCE_PREFIX || 'mock-pubsub-prefix-';
const projectId = process.env.GCP_PROJECT_ID;
const gcpCredential = process.env.gcpCredential || '{}';

const prefixedName = (name: string) => `${prefix}${name}`;

async function clearPubSubInstance(pubsub: PubSub | MockPubSub) {
  const [topics] = await pubsub.getTopics();
  const [subscriptions] = await pubsub.getSubscriptions();

  for (const topic of topics) {
    await topic.delete();
  }
  for (const subscription of subscriptions) {
    await subscription.delete();
  }
}

[
  {
    title: 'Real PubSub',
    pubsub: new PubSub({
      projectId: projectId,
      credentials: JSON.parse(gcpCredential),
    }),
    PubSubClass: PubSub,
  },
  {
    title: 'Mock PubSub',
    pubsub: new MockPubSub({ projectId: projectId }),
    PubSubClass: MockPubSub,
  },
].forEach(({ title, pubsub, PubSubClass }) => {
  describe(title, () => {
    beforeEach(async () => {
      await clearPubSubInstance(pubsub);
    });

    describe('creating, listing and deleting topics and subscriptions', () => {
      describe('createTopic', () => {
        it('should create a topic', async () => {
          const topicName = prefixedName('topic1');

          const [topic] = await pubsub.createTopic(topicName);

          expect(topic.name).toEqual(
            `projects/${projectId}/topics/${topicName}`,
          );
          expect(typeof topic.setPublishOptions).toEqual('function');
        });

        it('should throw error if topic already exists', async () => {
          const topicName = prefixedName('topic1');

          await pubsub.createTopic(topicName);
          try {
            await pubsub.createTopic(topicName);
            throw new Error('should throw before');
          } catch (error) {
            // @ts-expect-error error expected
            expect(error.message).toEqual(
              '6 ALREADY_EXISTS: Topic already exists',
            );
            // @ts-expect-error error expected
            expect(error.code).toEqual(6);
          }
        });
      });

      describe('getTopics', () => {
        it('should return list of existing topics for given PubSub instance', async () => {
          const otherProjectId = 'another-project-id';
          const otherPubsub = new PubSub({
            projectId: otherProjectId,
          });

          await clearPubSubInstance(otherPubsub);

          await Promise.all([
            pubsub.createTopic(prefixedName('t1')),
            pubsub.createTopic(prefixedName('t2')),
            otherPubsub.createTopic(prefixedName('t1')),
            otherPubsub.createTopic(prefixedName('t2')),
          ]);

          const [topics] = await pubsub.getTopics();
          const topicNames = topics.map((t) => t.name);

          const [otherPubsubTopics] = await otherPubsub.getTopics();
          const otherPubsubTopicsNames = otherPubsubTopics.map((t) => t.name);

          expect(topicNames).toEqual([
            `projects/${projectId}/topics/${prefixedName('t1')}`,
            `projects/${projectId}/topics/${prefixedName('t2')}`,
          ]);

          expect(otherPubsubTopicsNames).toEqual([
            `projects/${otherProjectId}/topics/${prefixedName('t1')}`,
            `projects/${otherProjectId}/topics/${prefixedName('t2')}`,
          ]);
        });
      });

      describe('topic.delete', () => {
        it('should delete a topic', async () => {
          await Promise.all([
            pubsub.createTopic(prefixedName('t1')),
            pubsub.createTopic(prefixedName('t2')),
          ]);

          await pubsub.topic(prefixedName('t1')).delete();

          const [topics] = await pubsub.getTopics();
          expect(topics.map((t) => t.name)).toEqual([
            `projects/${projectId}/topics/${prefixedName('t2')}`,
          ]);
        });

        it('should delete topic by its full name', async () => {
          await pubsub.createTopic(prefixedName('tod'));

          await pubsub
            .topic(`projects/${projectId}/topics/${prefixedName('tod')}`)
            .delete();

          const [topics] = await pubsub.getTopics();
          expect(topics).toEqual([]);
        });

        it('should throw error when deleting a non existing topic', async () => {
          try {
            await pubsub.topic(prefixedName('non-let')).delete();
            throw new Error('should throw before');
          } catch (error) {
            // @ts-expect-error error expected
            expect(error.message).toEqual('5 NOT_FOUND: Topic not found');
            // @ts-expect-error error expected
            expect(error.code).toEqual(5);
          }
        });
      });

      describe('topic.createSubscription', () => {
        it('should create a subscription', async () => {
          const [topic] = await pubsub.createTopic(prefixedName('ted'));
          const [subscription] = await topic.createSubscription(
            prefixedName('ted'),
          );

          expect(subscription.name).toEqual(
            `projects/${projectId}/subscriptions/${prefixedName('ted')}`,
          );
        });

        it('should throw error if subscription already exists', async () => {
          const [topic] = await pubsub.createTopic(prefixedName('lajos'));
          await topic.createSubscription(prefixedName('lajos'));

          try {
            await topic.createSubscription(prefixedName('lajos'));
            throw new Error('should throw before');
          } catch (error) {
            // @ts-expect-error error expected
            expect(error.message).toEqual(
              '6 ALREADY_EXISTS: Subscription already exists',
            );
            // @ts-expect-error error expected
            expect(error.code).toEqual(6);
          }
        });
      });

      describe('getSubscriptions', () => {
        it('should return list of existing subscriptions for given PubSub instance', async () => {
          const otherProjectId = 'another-project-id';
          const otherPubsub = new PubSub({
            projectId: otherProjectId,
          });

          const [topic] = await pubsub.createTopic(prefixedName('lajos'));
          const [otherProjectTopic] = await otherPubsub.createTopic(
            prefixedName('lajos'),
          );

          await Promise.all([
            await topic.createSubscription(prefixedName('l1')),
            await topic.createSubscription(prefixedName('l2')),
            await otherProjectTopic.createSubscription(prefixedName('l1')),
            await otherProjectTopic.createSubscription(prefixedName('l2')),
          ]);

          {
            const [subscriptions] = await pubsub.getSubscriptions();
            const subNames = subscriptions.map((s) => s.name);

            expect(subNames).toEqual([
              `projects/${projectId}/subscriptions/${prefixedName('l1')}`,
              `projects/${projectId}/subscriptions/${prefixedName('l2')}`,
            ]);
          }

          {
            const [subscriptions] = await otherPubsub.getSubscriptions();
            const subNames = subscriptions.map((s) => s.name);

            expect(subNames).toEqual([
              `projects/${otherProjectId}/subscriptions/${prefixedName('l1')}`,
              `projects/${otherProjectId}/subscriptions/${prefixedName('l2')}`,
            ]);
          }
        });
      });

      describe('subscription.delete', () => {
        it('should delete subscription', async () => {
          const [topic] = await pubsub.createTopic(prefixedName('lajos'));
          await topic.createSubscription(prefixedName('l1'));
          await topic.createSubscription(prefixedName('l2'));

          await pubsub.subscription(prefixedName('l1')).delete();

          const [subscriptions] = await pubsub.getSubscriptions();
          expect(subscriptions.map((s) => s.name)).toEqual([
            `projects/${projectId}/subscriptions/${prefixedName('l2')}`,
          ]);
        });

        it('should delete subscription by its full name', async () => {
          const [topic] = await pubsub.createTopic(prefixedName('lajos'));
          await topic.createSubscription(prefixedName('l1'));

          await pubsub
            .subscription(
              `projects/${projectId}/subscriptions/${prefixedName('l1')}`,
            )
            .delete();

          const [subscriptions] = await pubsub.getSubscriptions();
          expect(subscriptions).toEqual([]);
        });

        it('should throw error when deleting a non existing subscription', async () => {
          try {
            await pubsub.subscription(prefixedName('non-let')).delete();
            throw new Error('should throw before');
          } catch (error) {
            // @ts-expect-error error expected
            expect(error.message).toEqual(
              '5 NOT_FOUND: Subscription does not exist',
            );
            // @ts-expect-error error expected
            expect(error.code).toEqual(5);
          }
        });
      });

      describe('topic.subscription', () => {
        it('should return subscription through a topic object', async () => {
          const [topic] = await pubsub.createTopic(prefixedName('kacsa'));
          await topic.createSubscription(prefixedName('nyul'));

          const subscription = pubsub
            .topic(prefixedName('kacsa'))
            .subscription(prefixedName('nyul'));

          expect(subscription.name).toEqual(
            `projects/${projectId}/subscriptions/${prefixedName('nyul')}`,
          );
        });
      });
    });

    describe('publishing and consuming messages', () => {
      describe('topic.publish', () => {
        it('should consume messages published to a topic', async () => {
          const [topic] = await pubsub.createTopic(prefixedName('t32'));
          const [subscription] = await topic.createSubscription(
            prefixedName('s32'),
          );

          const receivedMessages: Message[] = [];
          subscription.on('message', (message) =>
            receivedMessages.push(message),
          );

          await topic.publish(Buffer.from('Test message!'), { kacsa: 'hap' });

          await waitForExpect(() =>
            expect(receivedMessages.length).toBeGreaterThan(0),
          );
          const message = receivedMessages[0];

          expect(message).toBeDefined();
          expect(message?.data.toString()).toEqual('Test message!');
          expect(message?.attributes).toEqual({ kacsa: 'hap' });
          expect(typeof message?.ack).toEqual('function');
          expect(typeof message?.nack).toEqual('function');
          subscription.removeAllListeners('message');
        });
      });

      describe('topic.publishMessage({data: Buffer})', () => {
        it('should consume messages published to a topic', async () => {
          const [topic] = await pubsub.createTopic(prefixedName('t32'));
          const [subscription] = await topic.createSubscription(
            prefixedName('s32'),
          );

          const receivedMessages: Message[] = [];
          subscription.on('message', (message) =>
            receivedMessages.push(message),
          );

          await topic.publishMessage({
            data: Buffer.from('Test message!'),
            attributes: { kacsa: 'hap' },
          });

          await waitForExpect(() =>
            expect(receivedMessages.length).toBeGreaterThan(0),
          );
          const message = receivedMessages[0];

          expect(message).toBeDefined();
          expect(message?.data.toString()).toEqual('Test message!');
          expect(message?.attributes).toEqual({ kacsa: 'hap' });
          expect(typeof message?.ack).toEqual('function');
          expect(typeof message?.nack).toEqual('function');
          subscription.removeAllListeners('message');
        });
      });

      describe('topic.publishMessage({json: String})', () => {
        it('should consume messages published to a topic', async () => {
          const [topic] = await pubsub.createTopic(prefixedName('t32'));
          const [subscription] = await topic.createSubscription(
            prefixedName('s32'),
          );

          const receivedMessages: Message[] = [];
          subscription.on('message', (message) =>
            receivedMessages.push(message),
          );

          await topic.publishMessage({
            json: { data: 'Test message!' },
            attributes: { kacsa: 'hap' },
          });

          await waitForExpect(() =>
            expect(receivedMessages.length).toBeGreaterThan(0),
          );
          const message = receivedMessages[0];

          expect(message).toBeDefined();
          // @ts-expect-error JSON parse will fail in case of undefined
          expect(JSON.parse(message?.data.toString())).toEqual({
            data: 'Test message!',
          });
          expect(message?.attributes).toEqual({ kacsa: 'hap' });
          expect(typeof message?.ack).toEqual('function');
          expect(typeof message?.nack).toEqual('function');
          subscription.removeAllListeners('message');
        });
      });

      it('should consume messages that were published before subscription consumption was started', async () => {
        const [topic] = await pubsub.createTopic(prefixedName('t34'));
        const [subscription] = await topic.createSubscription(
          prefixedName('s34'),
        );

        await topic.publish(Buffer.from('t45'));

        const receivedMessages: Message[] = [];
        subscription.on('message', (message) => receivedMessages.push(message));

        await waitForExpect(() =>
          expect(receivedMessages.length).toBeGreaterThan(0),
        );
        expect(receivedMessages[0]?.data.toString()).toEqual('t45');
        subscription.removeAllListeners('message');
      });

      it('should not receive messages if removeAllListeners was called on subscription', async () => {
        const [topic] = await pubsub.createTopic(prefixedName('t45'));
        const [subscription] = await topic.createSubscription(
          prefixedName('s45'),
        );
        const receivedMessages: Message[] = [];
        subscription.on('message', (message) => receivedMessages.push(message));

        subscription.removeAllListeners();

        await topic.publish(Buffer.from('t45'));
        await delay(100);
        expect(receivedMessages).toEqual([]);
      });

      it('should only pass messages to "message" event listeners', async () => {
        const [topic] = await pubsub.createTopic(prefixedName('t45'));
        const [subscription] = await topic.createSubscription(
          prefixedName('s45'),
        );

        const receivedMessages: unknown[] = [];
        subscription.on('error', (message) => receivedMessages.push(message));

        await topic.publish(Buffer.from('t45'));
        await delay(100);
        expect(receivedMessages).toEqual([]);
      });

      it('should redeliver a message if it was nacked', async () => {
        const [topic] = await pubsub.createTopic(prefixedName('t45'));
        const [subscription] = await topic.createSubscription(
          prefixedName('s45'),
        );

        const receivedMessages: Message[] = [];
        let nackedOnce = false;
        subscription.on('message', (message) => {
          receivedMessages.push(message);
          if (!nackedOnce) {
            nackedOnce = true;
            message.nack();
          }
        });
        await topic.publish(Buffer.from('tm43'));

        await waitForExpect(() => expect(receivedMessages.length).toBe(2));
        expect(receivedMessages[0]?.data.toString()).toEqual('tm43');
        expect(receivedMessages[1]?.data.toString()).toEqual('tm43');
        subscription.removeAllListeners('message');
      });

      it('should call all listeners randomly when more are attached to a single subscription', async () => {
        const [topic] = await pubsub.createTopic(prefixedName('t34'));
        const [subscription] = await topic.createSubscription(
          prefixedName('s34'),
        );

        const receivedMessages1 = [];
        subscription.on('message', (message) =>
          receivedMessages1.push(message),
        );
        const receivedMessages2 = [];
        subscription.on('message', (message) =>
          receivedMessages2.push(message),
        );

        for (let i = 0; i < 10; i++) {
          await topic.publish(Buffer.from('tm435'));
        }

        expect(receivedMessages1.length).toBeGreaterThan(1);
        expect(receivedMessages2.length).toBeGreaterThan(1);
        subscription.removeAllListeners();
      });
    });
  });
});
