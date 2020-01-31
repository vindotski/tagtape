<?php

namespace App\Form;

use App\Entity\Track;
use App\Validator\Constraint\Duration;
use Symfony\Component\Form\AbstractType;
use Symfony\Component\Form\Extension\Core\Type\HiddenType;
use Symfony\Component\Form\Extension\Core\Type\NumberType;
use Symfony\Component\Form\Extension\Core\Type\TextType;
use Symfony\Component\Form\Extension\Core\Type\UrlType;
use Symfony\Component\Form\FormBuilderInterface;
use Symfony\Component\OptionsResolver\OptionsResolver;

class TrackType extends AbstractType
{
    public function buildForm(FormBuilderInterface $builder, array $options)
    {
        $builder
            ->add('number', HiddenType::class)
            ->add('title', TextType::class, [
                'attr' => [
                    'placeholder' => 'Title'
                ]
            ])
            ->add('source', UrlType::class, [
                'attr' => [
                    'placeholder' => 'YouTube link'
                ],
                'constraints' => [
                    new Duration([
                        'max' => 600,
                        'invalidMessage' => "Duration can't be determined. Please remove this track."
                    ])
                ]
            ]);
    }

    public function configureOptions(OptionsResolver $resolver)
    {
        $resolver->setDefaults([
            'data_class' => Track::class,
        ]);
    }
}
