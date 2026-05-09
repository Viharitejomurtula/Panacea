from simulator import DiseaseModel
import argparse

def run_sim(pop, i_inf, days):
	model = DiseaseModel(population = pop, initial_infected = i_inf, seed = 42)
	for _ in range(days):
		model.step()
	print(model.results())


if __name__ == "__main__":
	p = argparse.ArgumentParser()
	p.add_argument("--pop",     type=int, default=100)
	p.add_argument("--infected",type=int, default=3)
	p.add_argument("--days",    type=int, default=60)
	args = p.parse_args()

	run_sim(args.pop, args.infected, args.days)
