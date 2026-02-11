import type { GameState, Contract, ItemStack, ResourceType, Loan } from './types';
import { RESOURCES, RESOURCE_LIST } from '../content/resources';
import { TICKS_PER_DAY, LOAN_INTEREST_RATE, MAX_LOAN_AMOUNT, CONTRACT_PENALTY_RATE } from '../utils/constants';
import { genId, seededRandom, daysSinceEpoch, pickRandom, clamp } from '../utils/helpers';

/**
 * Economy simulation:
 * - Dynamic market prices fluctuate based on supply/demand
 * - Selling terminals sell items at market price
 * - Contracts offer rewards for delivering specific items
 * - Loans provide capital with interest
 * - Reputation affects contract availability
 */

export function updateEconomy(state: GameState): void {
  // Update market prices every ~60 ticks (6 seconds)
  if (state.tick % 60 === 0) {
    updateMarketPrices(state);
  }

  // Process selling terminals
  processSales(state);

  // Check contract deadlines
  updateContracts(state);

  // Process loan interest daily
  if (state.tick % TICKS_PER_DAY === 0) {
    processLoans(state);
    state.day = Math.floor(state.tick / TICKS_PER_DAY) + 1;
  }

  // Generate new contracts periodically
  if (state.tick % (TICKS_PER_DAY / 2) === 0) {
    generateContracts(state);
  }
}

function updateMarketPrices(state: GameState): void {
  const marketMastery = state.research.completed.includes('market_mastery');
  const tradeEmpire = state.research.completed.includes('trade_empire');
  const volatilityMult = tradeEmpire ? 0.5 : 1;

  for (const price of state.market) {
    // Random demand walk
    const drift = (Math.random() - 0.5) * price.volatility * volatilityMult;
    price.demand = clamp(price.demand + drift, -0.8, 0.8);

    // Price follows demand
    const demandMult = 1 + price.demand * 0.5;
    price.currentPrice = price.basePrice * demandMult;

    // Apply market mastery bonus
    if (marketMastery) {
      price.currentPrice *= 1.15;
    }
  }
}

function processSales(state: GameState): void {
  for (const [id, entity] of state.entities) {
    if (entity.type !== 'selling_terminal') continue;
    if (!entity.enabled || !entity.powered || entity.durability <= 0) continue;

    const sellBuffer = (entity.data['sellBuffer'] as ItemStack[]) ?? [];
    if (sellBuffer.length === 0) continue;

    // Sell one item per tick
    const stack = sellBuffer[0];
    if (stack.amount > 0) {
      const marketPrice = state.market.find(m => m.resource === stack.resource);
      if (marketPrice) {
        state.money += marketPrice.currentPrice;

        // Fulfil contracts
        for (const contract of state.contracts) {
          if (!contract.accepted || contract.completed || contract.failed) continue;
          const req = contract.requirements.find(r => r.resource === stack.resource);
          const ful = contract.fulfilled.find(f => f.resource === stack.resource);
          if (req && ful && ful.amount < req.amount) {
            ful.amount++;
          }
        }

        // Reduce demand slightly (selling pressure)
        if (marketPrice) {
          marketPrice.demand = Math.max(-0.8, marketPrice.demand - 0.01);
        }

        stack.amount--;
        if (stack.amount <= 0) {
          sellBuffer.shift();
        }
      }
    }

    entity.data['sellBuffer'] = sellBuffer;
  }
}

function updateContracts(state: GameState): void {
  const tradeEmpire = state.research.completed.includes('trade_empire');

  for (const contract of state.contracts) {
    if (!contract.accepted || contract.completed || contract.failed) continue;

    // Check if fulfilled
    const fulfilled = contract.requirements.every(req => {
      const ful = contract.fulfilled.find(f => f.resource === req.resource);
      return ful && ful.amount >= req.amount;
    });

    if (fulfilled) {
      contract.completed = true;
      const reward = tradeEmpire ? contract.reward * 2 : contract.reward;
      state.money += reward;
      state.reputation += contract.reputationReward;
      state.alerts.push({
        id: `contract_${contract.id}`, type: 'info',
        message: `Contract "${contract.name}" completed! +$${reward}`,
        tick: state.tick, dismissed: false,
      });
    }

    // Check deadline
    if (state.tick >= contract.deadline) {
      contract.failed = true;
      const penalty = Math.floor(contract.reward * CONTRACT_PENALTY_RATE);
      state.money = Math.max(0, state.money - penalty);
      state.reputation = Math.max(0, state.reputation - 1);
      state.alerts.push({
        id: `contract_fail_${contract.id}`, type: 'warning',
        message: `Contract "${contract.name}" failed! -$${penalty}`,
        tick: state.tick, dismissed: false,
      });
    }
  }

  // Clean old completed/failed contracts
  const maxContracts = 20;
  if (state.contracts.length > maxContracts) {
    state.contracts = state.contracts.filter(c => !c.completed && !c.failed)
      .concat(state.contracts.filter(c => c.completed || c.failed).slice(-5));
  }
}

function generateContracts(state: GameState): void {
  const contractsPlus = state.research.completed.includes('contracts_plus');
  const activeContracts = state.contracts.filter(c => c.accepted && !c.completed && !c.failed);
  if (activeContracts.length >= 5) return;

  // Available contracts based on what player can produce
  const availableContracts = state.contracts.filter(c => !c.accepted && !c.completed && !c.failed);
  if (availableContracts.length >= 3) return;

  // Generate 1-2 new contracts
  const count = 1 + (contractsPlus ? 1 : 0);
  for (let i = 0; i < count; i++) {
    const contract = createContract(state, contractsPlus);
    state.contracts.push(contract);
  }
}

function createContract(state: GameState, upgraded: boolean): Contract {
  // Select resources based on what veins are available
  const tier = Math.min(3, Math.floor(state.reputation / 3));
  const resources = RESOURCE_LIST.filter(r => r.tier <= tier);
  const resource = pickRandom(resources);

  const amount = 5 + Math.floor(Math.random() * 20 * (1 + tier));
  const baseReward = resource.baseValue * amount * (1.5 + Math.random());
  const reward = Math.floor(upgraded ? baseReward * 1.5 : baseReward);
  const deadline = state.tick + TICKS_PER_DAY * (2 + Math.floor(Math.random() * 3));

  return {
    id: genId(),
    name: `Deliver ${amount} ${resource.name}`,
    requirements: [{ resource: resource.type, amount }],
    reward,
    reputationReward: 1 + tier,
    deadline,
    fulfilled: [{ resource: resource.type, amount: 0 }],
    accepted: false,
    completed: false,
    failed: false,
    daily: false,
  };
}

// Daily contracts (deterministic seed)
export function generateDailyContract(state: GameState): Contract {
  const daySeed = daysSinceEpoch() * 1000 + state.seed;
  const rng = seededRandom(daySeed);

  const tier = Math.min(2, Math.floor(state.reputation / 5));
  const resources = RESOURCE_LIST.filter(r => r.tier <= tier + 1);
  const idx = Math.floor(rng() * resources.length);
  const resource = resources[idx];

  const amount = 10 + Math.floor(rng() * 30);
  const reward = Math.floor(resource.baseValue * amount * 2.5);

  return {
    id: `daily_${daysSinceEpoch()}`,
    name: `[DAILY] Deliver ${amount} ${resource.name}`,
    requirements: [{ resource: resource.type, amount }],
    reward,
    reputationReward: 3,
    deadline: state.tick + TICKS_PER_DAY * 1,
    fulfilled: [{ resource: resource.type, amount: 0 }],
    accepted: false,
    completed: false,
    failed: false,
    daily: true,
  };
}

export function takeLoan(state: GameState, amount: number): boolean {
  if (amount <= 0 || amount > MAX_LOAN_AMOUNT) return false;
  const totalDebt = state.loans.reduce((s, l) => s + l.remaining, 0);
  if (totalDebt + amount > MAX_LOAN_AMOUNT) return false;

  state.loans.push({
    id: genId(),
    principal: amount,
    remaining: amount,
    interestRate: LOAN_INTEREST_RATE,
    daysTaken: state.day,
    daysRemaining: 30,
  });
  state.money += amount;
  return true;
}

export function repayLoan(state: GameState, loanId: string, amount: number): boolean {
  const loan = state.loans.find(l => l.id === loanId);
  if (!loan || amount <= 0 || amount > state.money) return false;
  const payment = Math.min(amount, loan.remaining);
  loan.remaining -= payment;
  state.money -= payment;
  if (loan.remaining <= 0) {
    state.loans = state.loans.filter(l => l.id !== loanId);
  }
  return true;
}

function processLoans(state: GameState): void {
  for (const loan of state.loans) {
    loan.remaining += loan.remaining * loan.interestRate;
    loan.daysRemaining--;

    if (loan.daysRemaining <= 0 && loan.remaining > 0) {
      // Force repayment
      const penalty = Math.floor(loan.remaining * 0.5);
      state.money = Math.max(0, state.money - loan.remaining);
      state.reputation = Math.max(0, state.reputation - 5);
      state.alerts.push({
        id: `loan_${loan.id}`, type: 'danger',
        message: `Loan defaulted! Lost $${loan.remaining}. Reputation -5.`,
        tick: state.tick, dismissed: false,
      });
    }
  }
  state.loans = state.loans.filter(l => l.daysRemaining > 0 || l.remaining > 0);
}
