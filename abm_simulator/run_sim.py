from simulator import DiseaseModel
import argparse
from enum import Enum

class Diseases(str, Enum):
	covid_wuhan = "covid_wuhan"
	hantavirus_andes = "hantavirus_andes"
	h1n1_swine_flu = "h1n1_swine_flu"
	human_metapneumovirus = "human_metapneumovirus"
	influenza_a_h3n2 = "influenza_a_h3n2"
	spanish_flu = "spanish_flu"
def run_sim(disease: Diseases, pop, i_inf, days):
	model = DiseaseModel(disease = disease, population = pop, initial_infected = i_inf, seed = 42)
	for _ in range(days):
		model.step()
	print(model.results())


if __name__ == "__main__":
	p = argparse.ArgumentParser()
	p.add_argument("--disease", type=str, default="covid_wuhan")
	p.add_argument("--pop",     type=int, default=100)
	p.add_argument("--infected",type=int, default=3)
	p.add_argument("--days",    type=int, default=60)
	args = p.parse_args()

	run_sim(args.disease, args.pop, args.infected, args.days)
