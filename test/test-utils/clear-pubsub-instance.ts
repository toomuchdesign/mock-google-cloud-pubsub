import { PubSub } from '@google-cloud/pubsub';
import { PubSub as MockPubSub } from '../../src';

export async function clearPubSubInstance(pubsub: PubSub | MockPubSub) {
  const [topics] = await pubsub.getTopics();
  const [subscriptions] = await pubsub.getSubscriptions();

  for (const topic of topics) {
    await topic.delete();
  }

  for (const subscription of subscriptions) {
    await subscription.delete();
  }
}
