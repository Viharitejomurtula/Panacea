from enum import Enum
import mesa
from typing import Annotated


class infection_state(str, Enum):
        S = "Susceptible"
        I = "Infected"
        E = "Exposed"
        R = "Recovered"
        D = "Dead"

class age_group(tuple, Enum):
        baby = (0, 2)
        child = (3, 15)
        adult = (16, 64)
        elderly = (65, 150)

class Human(mesa.Agent):
        def __init__(self, model, state = "S", day_infected = -1, state_length = 0, age_group:age_group, wears_mask, is_vaccinated):
                super().__init__(model)
                self.state = state
                self.day_infected = day_infected
                self.state_length = state_length
                self.age_group = age_group
                if RAND(1-1000) in [1-4]:  #this has to happen everyday
                        is_vaccinated = true

                if RAND(1-10) in [1-6]:   #this only happens once
                        wears_mask = true
                if in age_group_1:
                        self.contacts_pd = 3
                elif in age_group_2:
                        self.contacts_pd = 20
                elif in age_group_3:
                        self.contacts_pd = 12
                else:
                        self.contacts_pd = 5
        def step(self):
                #if no intervention
                        #if susceptible go about your day
                                #per contact who is infected
                                        #if RAND(1-10) is bw 1-7
                                                #change state to exposed
                                        #else
                                                #keep going about your day
                        #if exposed
                                #if days in state >= days_to_infection
                                        #change state to infected
                                #else
                                        #go about your day
                        #if infected
                                #decrease contacts by X% unless you are in age_group_1 or age_group_4
                                #if in age_group_1
                                        #rand(1-100) 1-50: RECOVER
                                        #rand(1-100) 50-100: RECOVER
                                #if in age_group_2
                                        #rand(1-100) 20-80: RECOVER
                                        #rand(1-100) 1-20: DIE
                                #if in age_group_3
                                        #rand(1-100) 10-90: RECOVER
                                        #rand(1-100) 1-10: DIE
                                #if in age_group_4
                                        #rand(1-10) 1-5: DIE
                        #if recovered go about your day
                #if intervention
                        #if lockdown
                                #decrease average contacts by 70%
                        #if mask mandate
                                #if wears_mask
                                        #decrease infection rate
                        #if vaccine
                                #if is_vaccinated
                                        #decrease infection rate



class Disease(mesa.Model):
