import { Algorithm, AlgorithmType, TestResult } from "@app/lib/algorithms";
import { Dataset, Test } from "@app/lib/datasets";
import { ChatCompletion, ChatMessage, ChatQuery, Model } from "@app/lib/models";

export class CoT extends Algorithm {
  readonly N_SHOT = 8;
  readonly TEMPERATURE = 0.7;

  private results: TestResult[];

  constructor(dataset: Dataset, model: Model) {
    super(dataset, model);
    this.results = [];
  }

  algorithm(): AlgorithmType {
    return "CoT";
  }

  async runOne({
    test,
    iteration,
    debug,
  }: {
    test: Test;
    iteration?: number;
    debug?: boolean;
  }): Promise<TestResult> {
    const examples = this.dataset.examples({
      problem: test.id,
      count: this.N_SHOT,
      iteration: iteration || 0,
    });

    // console.log(`Running test: id=${test.id} examples=${examples.length}`);

    const messages: ChatMessage[] = [];

    let prompt = `INSTRUCTIONS:\n`;
    prompt += ` ${this.dataset.instructions()}`;
    prompt += "\n\n";
    prompt += `Start by providing a REASONING consisting in multiple steps, using one line per step.`;
    prompt += ` ${this.dataset.reasoningStepInstructions()}`;
    prompt += ` Finally provide a final ANSWER.`;
    prompt += ` ${this.dataset.answerInstructions()}`;
    // prompt +=
    //   ` Do not perform multiple reasoning attempts per question,` +
    //   ` do not backtrack in your reasoning steps.`;
    prompt += "\n\n";
    prompt += `EXAMPLES:\n`;

    for (const e of examples.slice(0, 4)) {
      prompt += `\nQUESTION: ${e.question}\n`;
      prompt += `REASONING:\n${e.reasoning.join("\n")}\n`;
      prompt += `ANSWER: ${e.answer}\n`;
    }

    messages.push({
      role: "system",
      content: prompt,
    });

    for (const e of examples.slice(4)) {
      messages.push({
        role: "user",
        content: `QUESTION: ${e.question}`,
      });
      messages.push({
        role: "assistant",
        content: `REASONING:\n${e.reasoning.join("\n")}\nANSWER: ${e.answer}`,
      });
    }

    messages.push({
      role: "user",
      content: `QUESTION: ${test.question}`,
    });

    // console.log(prompt);
    // console.log(messages);

    let maxTokens: number | undefined = undefined;
    const datasetMaxTokens = this.dataset.maxTokens();
    if (datasetMaxTokens.reasoning && datasetMaxTokens.answer) {
      maxTokens = datasetMaxTokens.reasoning + datasetMaxTokens.answer;
    }

    const query: ChatQuery = {
      provider: this.model.provider,
      model: this.model.model(),
      messages,
      temperature: this.TEMPERATURE,
      maxTokens,
    };

    const c = await this.runCompletion(query);

    const finish = async (
      test: Test,
      completion: ChatCompletion,
      query: ChatQuery,
      check: boolean,
      answer: string
    ) => {
      await this.storeCompletion({
        test,
        completion,
        query,
        check,
      });
      this.stats();

      const result: TestResult = {
        test,
        answer,
        check,
      };
      this.results.push(result);
      return result;
    };

    if (debug) {
      console.log("+++++++++++++++++++++++++");
      console.log(c.content);
      console.log("+++++++++++++++++++++++++");
    }

    if (!c.content || !c.content.includes("REASONING:")) {
      return await finish(test, c, query, false, "");
    }

    const content = c.content.split("REASONING:")[1].trim();

    if (!content.includes("ANSWER:")) {
      return await finish(test, c, query, false, "");
    }

    const reasoning = content.split("ANSWER:")[0].trim().split("\n");
    const answer = content.split("ANSWER:")[1].trim();

    let check = false;
    try {
      check = await this.dataset.check({ test, answer });
    } catch (e) {
      // Nothing to do, check failed.
    }

    if (debug) {
      console.log(`REASONING: ${reasoning.join(" ")}`);
      console.log(`ANSWER: ${answer}`);
      console.log(`CHECK: ${check}`);
      console.log("-------------------------");
    }

    return await finish(test, c, query, check, answer);
  }

  computeResults(): void {
    console.log(
      `Result: algorithm=${this.algorithm()} dataset=${this.dataset.dataset} ` +
        `provider=${this.model.provider} model=${this.model.model()} ` +
        `check=${this.results.filter((x) => x.check).length} total=${
          this.results.length
        }`
    );
  }
}
