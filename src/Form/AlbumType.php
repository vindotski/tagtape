<?php

namespace App\Form;

use App\Entity\Album;
use Symfony\Component\Form\AbstractType;
use Symfony\Component\Form\Extension\Core\Type\CollectionType;
use Symfony\Component\Form\FormBuilderInterface;
use Symfony\Component\OptionsResolver\OptionsResolver;
use Symfony\Component\Validator\Constraints\Count;

class AlbumType extends AbstractType
{
    public function buildForm(FormBuilderInterface $builder, array $options)
    {
        $builder
            ->add('title')
            ->add('year')
            ->add('artist', ArtistType::class, [
                'label' => false
            ])
            ->add('tracks', CollectionType::class, [
                'entry_type' => TrackType::class,
                'entry_options' => [
                    'label' => false
                ],
                'allow_add' => true,
                'constraints' => [
                    new Count([
                        'min' => 1,
                        'max' => 10,
                        'minMessage' => 'You must specify at least one song',
                        'maxMessage' => 'You cannot specify more than {{ limit }} songs'
                    ])
                ]
            ]);
    }

    public function configureOptions(OptionsResolver $resolver)
    {
        $resolver->setDefaults([
            'data_class' => Album::class,
        ]);
    }
}
